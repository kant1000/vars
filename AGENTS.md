# VARS Agent Instructions

Before making changes in this repository, read:

```powershell
Get-Content docs/codex/PROJECT_HANDOFF.md
Get-Content docs/codex/CLEANUP_ROADMAP.md
Get-Content docs/ACCESS_AND_AUDIT.md
```

Then run:

```powershell
git status --short --branch
corepack yarn audit:access
```

If network access is needed, run:

```powershell
corepack yarn audit:access:network
```

Preserve the dirty worktree. Do not revert user or tool changes unless explicitly requested. Do not commit or print secrets.
