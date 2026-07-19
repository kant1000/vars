# Mobile Device Testing — Build Decision Process

How to get a testable Android build running, every time, without re-deriving the decision from scratch. This is the process born out of the Android Gradle build fights in `docs/audit/mobile.md` §6 (`expo-haptics` version mismatch, Sentry double-autolinking) — both are fixed and persisted (see below), so a Gradle failure today is a *new* problem, not one of those two.

## Decision rule

1. **Is a phone connected via USB with debugging authorized?** Check first, always — this determines the whole path.
2. **Phone connected → local debug Gradle build.** This is the tried-and-tested path (verified on a physical Samsung Galaxy A40, `docs/audit/mobile.md` §6). Faster than a cloud build, and gives real device logs.
3. **No phone connected → EAS Cloud Build.** `eas build --platform android --profile preview`, produces a shareable `.apk`. Avoids Windows PATH/JDK friction entirely — this is the only path when there's nothing physically plugged in.
4. **Phone connected AND the installed app already matches the current code → skip the rebuild.** Don't reinstall an APK that's already current. Just start Metro so the existing install can connect. Freshness is checked mechanically (step-by-step below), never guessed.

## Step-by-step (phone connected)

Run from `apps/mobile/`. Commands are PowerShell (this project's primary shell).

**1. Find adb and confirm a device is authorized:**
```powershell
$adb = (Get-Command adb -ErrorAction SilentlyContinue).Source
if (-not $adb) { $adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" }
& $adb devices -l
```
A device must show state `device` (not `unauthorized`, not `offline`). If the list is empty, fall to the EAS path below.

**2. Check whether the installed app is already current** — compare the last successful build's commit against HEAD, and confirm nothing uncommitted in `apps/mobile` since:
```powershell
git status --porcelain -- apps/mobile
git rev-parse HEAD
Get-Content apps/mobile/.device-build-marker.json -ErrorAction SilentlyContinue
```
- If `git status --porcelain` has output (uncommitted changes in `apps/mobile`) → **not current**, rebuild.
- Else if the marker's `commit` doesn't match `git rev-parse HEAD` → **not current**, rebuild.
- Else if no marker file exists yet → **not current** (never verified), rebuild.
- Else → **current**. Skip straight to step 5 (just start Metro).

**3. If `android/` doesn't exist yet** (it's gitignored — regenerated fresh on a new clone, wiped after a clean), regenerate it — this also reapplies the Sentry autolink config plugin automatically, no manual step needed:
```powershell
npx expo prebuild -p android
```
`android/local.properties` is inside the gitignored `android/` tree too, so it won't exist after a fresh prebuild — Gradle fails with `SDK location not found` until it's created:
```powershell
Set-Content -Path android/local.properties -Value "sdk.dir=$($env:LOCALAPPDATA -replace '\\','\\\\')\\Android\\Sdk" -Encoding utf8
```

**4. Build, install, and record the marker:**
```powershell
cd android
.\gradlew.bat app:assembleDebug
cd ..
& $adb install -r android\app\build\outputs\apk\debug\app-debug.apk
& $adb reverse tcp:8081 tcp:8081
$marker = @{ commit = (git rev-parse HEAD); builtAt = (Get-Date -Format o) } | ConvertTo-Json
Set-Content -Path apps/mobile/.device-build-marker.json -Value $marker -Encoding utf8
```

**5. Start Metro so the app (freshly installed or already current) can connect:**
```powershell
npx expo start --dev-client
```
Open the app already on the phone (package `com.vars.app`) — it connects over the `adb reverse` USB tunnel.

**If port 8081 is already occupied, don't assume it's reusable.** Check what's actually running there before connecting to it:
```powershell
Get-CimInstance Win32_Process -Filter "ProcessId = <pid from Get-NetTCPConnection -LocalPort 8081>" | Select CommandLine
```
`packager-status:running` on `/status` only confirms *a* Metro is alive — it does not confirm it was started with `--dev-client`. A session started as plain `expo start --android` (classic/Expo-Go-style manifest) will cause the dev-client's manifest handshake to fail with **"Error loading app: Remote update request not successful"** on the phone — a confusing error that looks like an EAS Update/network problem but is actually just the wrong Metro mode. Kill it (`Stop-Process -Id <pid> -Force`) and start a fresh `--dev-client` session instead of reusing it.

## Step-by-step (no phone connected)

```powershell
eas build --platform android --profile preview
```
`eas.json`'s `preview` profile is already configured for `distribution: internal`, `buildType: apk` — produces a directly-installable, shareable APK link/QR. No code changes needed to trigger this.

## Marker file

`apps/mobile/.device-build-marker.json` is gitignored (see root `.gitignore`). It exists purely so this process doesn't have to guess "is the phone's install stale" — it's a mechanical git-commit comparison, not a judgment call.

## Known-fixed Gradle issues (don't re-diagnose these)

Both root-caused and fixed in `docs/audit/mobile.md` §6 — if a build fails, it is not these:
- `expo-haptics` pinned to an SDK-incompatible version → fixed, now `~14.0.1` in `apps/mobile/package.json`.
- `@sentry/react-native` double-autolinking (two colliding Gradle projects for the same module) → fixed via `apps/mobile/plugins/withSentryAutolinkFix.js`, auto-applied on every `expo prebuild` through `app.config.js`.
