# Mobile Theme Checklist — Light/Dark and Icon Completeness

Checklist for every new screen, component, or style change in `apps/mobile`. This exists because "types pass, lint passes, bundle compiles" already proved insufficient once — the app-wide dark-mode gap (`docs/audit/mobile.md` §6, "Dark mode is now wired into every real screen") was only caught by a founder testing the build on-device, not by any static check. Don't rely on review alone to catch the next one — follow this mechanically.

## 1. Colors — theme tokens, not static `Colors.*`

- Any new style must read from `theme.color.*` via `useVarsTheme()` + `useMemo(() => makeStyles(theme), [theme])` — the established pattern in every screen (see `apps/mobile/app/(tabs)/index.tsx` for a reference implementation).
- **Deliberate exceptions** — these stay on the static `Colors` object on purpose, not by oversight. Don't "fix" these into theme tokens without a real reason:
  - Per-status semantic color maps (`STATUS_CONFIG`, `STATE_STYLE` — object keys stay string literals, see `CLAUDE.md` Constants and Types).
  - Brand accent colors (Google/Facebook auth buttons, pioneer gold) — see `CLAUDE.md` Brand Color Exceptions.
  - Fixed-warning banners (`OfflineBanner`, the home screen's location-permission banner, vendor grace-period/service-rendered reminders) — amber `Colors.warning`, deliberately theme-invariant so a warning reads as a warning regardless of appearance mode.
  - Fixed-contrast overlays on photos, maps, or WebViews — the underlying content isn't theme-aware, so the overlay can't be either.
- If you're not sure whether a color you're touching is a deliberate exception or a missed spot, check `docs/VARS_PROJECT_CONTEXT.md`'s Visual System table before changing it either way.

## 2. Icons — both platforms, every time

- Icons are two-sided: `apps/mobile/components/ui/iconMap.ts`'s `iconSystemNames` maps every icon name to both an iOS SF Symbol and an Android Material Icons glyph, backed by an SVG fallback in `SvgIconByName`. Adding an icon means adding all three, not just the one platform you're looking at.
- Verify the iOS name exists in `sf-symbols-typescript`'s `SFSymbol` union and the Android name exists in `@expo/vector-icons`'s classic `MaterialIcons` glyph map (not Material Symbols — see the Icon system row in `docs/VARS_PROJECT_CONTEXT.md` for why it's the classic font).
- Check `iconSystemNames` for an existing entry before adding a new icon or reaching for a raw `<Text>` glyph/emoji — many common icons (search, pin, star, etc.) are already mapped and just not wired into every screen that could use them.

## 3. Verify on-device in both modes

- Toggle Appearance to dark mode (Settings, or the `_dev-visual-preview` screen) and actually look at the screen you changed in both light and dark before calling it done. A clean TypeScript/lint pass does not confirm a visual fix — see the incident this checklist exists to prevent.
- For device-build mechanics (Gradle vs. EAS, Metro dev-client mode), see `docs/MOBILE_DEVICE_TESTING.md`.
