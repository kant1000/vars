param(
  [switch]$CheckNetwork,
  [switch]$Strict
)

$ErrorActionPreference = "Continue"
$failed = $false

function Write-Section {
  param([string]$Title)
  Write-Host ""
  Write-Host "== $Title =="
}

function Invoke-Check {
  param(
    [string]$Name,
    [scriptblock]$Command,
    [switch]$Required
  )

  Write-Host "- $Name"
  try {
    & $Command
    if ($LASTEXITCODE -ne $null -and $LASTEXITCODE -ne 0) {
      throw "Exit code $LASTEXITCODE"
    }
  } catch {
    Write-Host "  FAILED: $($_.Exception.Message)" -ForegroundColor Red
    if ($Required -or $Strict) {
      $script:failed = $true
    }
  }
}

function Test-EnvName {
  param([string]$Name)
  $files = @(".env.local", ".env", "apps/mobile/.env", "apps/mobile/.env.example", "apps/admin/.env.local")
  $fileHits = @()
  foreach ($file in $files) {
    if (Test-Path $file) {
      $match = Select-String -Path $file -Pattern "^$([regex]::Escape($Name))\s*=" -Quiet
      if ($match) {
        $fileHits += $file
      }
    }
  }

  if ([Environment]::GetEnvironmentVariable($Name)) {
    Write-Host "- ${Name}: set"
  } elseif ($fileHits.Count -gt 0) {
    Write-Host "- ${Name}: present in $($fileHits -join ', ')"
  } else {
    Write-Host "- ${Name}: missing"
  }
}

Write-Section "Workspace"
Invoke-Check "Repository status" { git status --short --branch } -Required
Invoke-Check "Git remotes" { git remote -v } -Required
Invoke-Check "Current branch" { git branch -vv } -Required

Write-Section "Tooling"
Invoke-Check "Node.js" { node --version } -Required
Invoke-Check "Yarn" { yarn --version } -Required
Invoke-Check "Supabase CLI" { supabase --version }

Write-Section "Project Files"
Invoke-Check "Root package manifest" { Test-Path package.json | Write-Host } -Required
Invoke-Check "Root lockfile" { Test-Path yarn.lock | Write-Host } -Required
Invoke-Check "Mobile package manifest" { Test-Path apps/mobile/package.json | Write-Host } -Required
Invoke-Check "Admin package manifest" { Test-Path apps/admin/package.json | Write-Host } -Required
Invoke-Check "Landing package manifest" { Test-Path apps/landing/package.json | Write-Host } -Required
Invoke-Check "Shared package manifest" { Test-Path packages/shared/package.json | Write-Host } -Required
Invoke-Check "Supabase directory" { Test-Path supabase | Write-Host } -Required

Write-Section "Local Environment Presence"
Invoke-Check "Root .env.example" { Test-Path .env.example | Write-Host } -Required
Invoke-Check "Root .env.local" { Test-Path .env.local | Write-Host }
Invoke-Check "Mobile .env.example" { Test-Path apps/mobile/.env.example | Write-Host }
Invoke-Check "Admin .env.local" { Test-Path apps/admin/.env.local | Write-Host }

Write-Section "Expected Environment Variables"
Test-EnvName "SUPABASE_URL"
Test-EnvName "SUPABASE_ANON_KEY"
Test-EnvName "SUPABASE_SERVICE_ROLE_KEY"
Test-EnvName "PAYSTACK_SECRET_KEY"
Test-EnvName "PAYSTACK_PUBLIC_KEY"
Test-EnvName "PAYSTACK_VARS_RECIPIENT_CODE"
Test-EnvName "YOUVERIFY_API_KEY"
Test-EnvName "YOUVERIFY_BASE_URL"
Test-EnvName "GOOGLE_MAPS_API_KEY"
Test-EnvName "EXPO_PUBLIC_SUPABASE_URL"
Test-EnvName "EXPO_PUBLIC_SUPABASE_ANON_KEY"
Test-EnvName "EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY"
Test-EnvName "EXPO_PUBLIC_GOOGLE_MAPS_API_KEY"
Test-EnvName "NEXT_PUBLIC_SUPABASE_URL"
Test-EnvName "NEXT_PUBLIC_SUPABASE_ANON_KEY"

if ($CheckNetwork) {
  Write-Section "Networked Access"
  Invoke-Check "GitHub remote heads" { git ls-remote --heads origin } -Required
}

if ($failed) {
  Write-Host ""
  Write-Host "Access audit failed." -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "Access audit complete."
