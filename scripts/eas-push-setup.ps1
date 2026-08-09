# Abroadster — EAS / push setup helper
# Run from project root in PowerShell:
#   powershell -ExecutionPolicy Bypass -File .\scripts\eas-push-setup.ps1
#
# This script does everything that does NOT require typing your password.
# When it pauses, follow the printed steps exactly.

$ErrorActionPreference = "Stop"
Set-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))

Write-Host ""
Write-Host "=== Abroadster EAS / Push Setup ===" -ForegroundColor Cyan
Write-Host ""

function Get-ExpoWhoAmI {
  try {
    $out = npx --yes expo whoami 2>&1 | Out-String
    if ($out -match "Not logged in" -or $LASTEXITCODE -ne 0) {
      return $null
    }
    $line = ($out -split "`n" | Where-Object { $_.Trim() -ne "" } | Select-Object -Last 1).Trim()
    if ($line -and $line -notmatch "error|Error|logged") { return $line }
    return $null
  } catch {
    return $null
  }
}

$who = Get-ExpoWhoAmI
if (-not $who) {
  Write-Host "You are NOT logged into Expo yet. That part must be you." -ForegroundColor Yellow
  Write-Host ""
  Write-Host "STEP A — Create / sign in to Expo (one time)" -ForegroundColor Green
  Write-Host "  1. Open: https://expo.dev/signup"
  Write-Host "     (or https://expo.dev/login if you already have an account)"
  Write-Host "  2. Sign up with email/Google/GitHub — any is fine."
  Write-Host "  3. Come back to this PowerShell window."
  Write-Host ""
  Write-Host "STEP B — Log the CLI into your Expo account" -ForegroundColor Green
  Write-Host "  Run this command, then follow the prompts:"
  Write-Host ""
  Write-Host "    npx eas-cli login" -ForegroundColor White
  Write-Host ""
  Write-Host "  - It may open a browser, OR ask for email + password in the terminal."
  Write-Host "  - When it says you are logged in, run THIS script again:"
  Write-Host ""
  Write-Host "    powershell -ExecutionPolicy Bypass -File .\scripts\eas-push-setup.ps1" -ForegroundColor White
  Write-Host ""

  $open = Read-Host "Open expo.dev/signup in your browser now? (y/n)"
  if ($open -eq "y" -or $open -eq "Y") {
    Start-Process "https://expo.dev/signup"
  }
  exit 0
}

Write-Host "Logged in to Expo as: $who" -ForegroundColor Green
Write-Host ""

# Check if projectId already exists
$appJsonPath = Join-Path (Get-Location) "app.json"
$appRaw = Get-Content $appJsonPath -Raw
$hasProjectId = $appRaw -match '"projectId"\s*:\s*"[0-9a-fA-F-]{8,}"'

if (-not $hasProjectId) {
  Write-Host "STEP C — Link this app to EAS (creates projectId for push)" -ForegroundColor Green
  Write-Host "  Running: npx eas-cli init"
  Write-Host "  When asked:"
  Write-Host "    - Which account should own this project?  → pick your username ($who)"
  Write-Host "    - Create a project for @.../abroadster? → Yes"
  Write-Host ""
  npx --yes eas-cli init
  if ($LASTEXITCODE -ne 0) {
    Write-Host "eas init failed. Fix the error above, then re-run this script." -ForegroundColor Red
    exit 1
  }
  Write-Host ""
  Write-Host "EAS project linked. app.json should now contain extra.eas.projectId" -ForegroundColor Green
} else {
  Write-Host "EAS projectId already present in app.json — skipping init." -ForegroundColor Green
}

Write-Host ""
Write-Host "STEP D — Build a real phone install (required for push when app is closed)" -ForegroundColor Green
Write-Host "  Pick ONE platform to start (Android is usually easiest):"
Write-Host ""
Write-Host "  Android phone:" -ForegroundColor White
Write-Host "    npx eas-cli build --platform android --profile preview"
Write-Host ""
Write-Host "  iPhone (needs Apple Developer account, ~`$99/year):" -ForegroundColor White
Write-Host "    npx eas-cli build --platform ios --profile preview"
Write-Host ""
Write-Host "  After the build finishes, Expo gives you a QR code / download link."
Write-Host "  Install that build on your phone (not Expo Go for best push reliability)."
Write-Host ""

$build = Read-Host "Start an Android preview build now? (y/n)"
if ($build -eq "y" -or $build -eq "Y") {
  Write-Host "Starting Android preview build (can take 10–20 minutes)..." -ForegroundColor Cyan
  npx --yes eas-cli build --platform android --profile preview
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed or was cancelled. You can retry later with the command above." -ForegroundColor Yellow
    exit 1
  }
  Write-Host ""
  Write-Host "When the build page shows Install, open that link on your Android phone." -ForegroundColor Green
} else {
  Write-Host "Skipped build. Run the Android or iOS command above whenever you are ready." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Done with automated setup." -ForegroundColor Cyan
Write-Host "After installing the build: sign up/in, allow notifications, then test a like/DM from another account."
Write-Host ""
