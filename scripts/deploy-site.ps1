# One-command production deploy of the site (bagrut-materials) -> https://bagrut-materials.vercel.app
#
# Usage (from the repo root, PowerShell):
#   powershell -ExecutionPolicy Bypass -File scripts\deploy-site.ps1 -Message "what changed"
#   powershell -ExecutionPolicy Bypass -File scripts\deploy-site.ps1            # deploy current HEAD as-is
#   -SkipPush  deploy without pushing to GitHub      -SkipTsc  skip the typecheck gate
#
# Why this exists: fallback/fast path. The repo is PUBLIC since 2026-10-04 (like gemach-app), so a plain `git push` deploys
# by itself; use this script when you want an immediate deploy from this computer or if a push shows "Blocked" again
# (before the repo was public, Hobby + private repo blocked every push). Push is still done here, for the
# two-computer git sync. Full background: README.md "Deploy" + CLAUDE.md "Deploying the live site".
#
# What it does: typecheck gate -> (commit source paths if -Message) -> push -> deploy a CLEAN `git archive HEAD`
# export (so untracked scratch files are never uploaded) with --archive=tgz (a plain upload fails on this
# machine's TLS-intercepting network with "fetch failed") -> verify Vercel says Ready and the site answers 200.

param(
  [string]$Message = "",
  [switch]$SkipPush,
  [switch]$SkipTsc
)

$ErrorActionPreference = "Continue"   # git/npx write progress to stderr; we check exit codes ourselves
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$env:Path = "C:\Program Files\nodejs;" + $env:Path
$env:NODE_OPTIONS = "--use-system-ca"
$scope = "team_ktg14QXUIxVh6dPLI5awK0Vw"
$site = "https://bagrut-materials.vercel.app"

function Fail([string]$m) { Write-Host "ABORT: $m" -ForegroundColor Red; exit 1 }
function Step([string]$m) { Write-Host "`n== $m" -ForegroundColor Cyan }
function GitOk { & git.exe @args 2>$null; if ($LASTEXITCODE -ne 0) { Fail "git $($args -join ' ') failed" } }

Step "Machine / branch"
Write-Host "host: $env:COMPUTERNAME"
$branch = (& git rev-parse --abbrev-ref HEAD 2>$null).Trim()
if ($branch -ne "main") { Fail "on branch '$branch', deploy only from main" }
GitOk fetch origin
$behind = [int](& git rev-list --count HEAD..origin/main 2>$null)
if ($behind -gt 0) { Fail "local main is $behind commit(s) behind origin/main - run 'git pull' first (the other computer pushed)" }

if ($Message) {
  Step "Commit source paths"
  # Allowlist only: never `git add -A` (the repo root holds 100+ untracked scratch files and other sessions' work).
  $paths = @("src", "public", "scripts", "docs", "package.json", "package-lock.json", "next.config.ts", "tsconfig.json", "CLAUDE.md", "AGENTS.md", "README.md", ".claude/commands") | Where-Object { Test-Path $_ }
  & git add -- @paths 2>$null
  & git diff --cached --quiet 2>$null
  if ($LASTEXITCODE -ne 0) {
    & git commit -q -m $Message -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" 2>$null
    if ($LASTEXITCODE -ne 0) { Fail "git commit failed" }
    Write-Host "committed: $Message"
  } else { Write-Host "nothing new to commit in source paths" }
}

$dirty = & git status --porcelain -- src public scripts docs package.json 2>$null | Where-Object { $_ -notmatch '^\?\?' }
if ($dirty) {
  Write-Host "WARNING: uncommitted tracked changes are NOT in this deploy (only HEAD is shipped):" -ForegroundColor Yellow
  $dirty | Select-Object -First 15 | ForEach-Object { Write-Host "  $_" }
}

if (-not $SkipTsc) {
  Step "Typecheck gate (src/ and scripts/ only; scratch _*.ts are ignored)"
  $tsc = & npx --yes tsc --noEmit 2>&1 | Out-String
  $bad = $tsc -split "`n" | Where-Object { $_ -match '^(src|scripts)[\\/]' }
  if ($bad) { $bad | Select-Object -First 20 | ForEach-Object { Write-Host $_ }; Fail "typecheck errors in src/scripts" }
  Write-Host "typecheck clean"
}

if (-not $SkipPush) {
  Step "Push to GitHub (sync between the two computers; does NOT deploy by itself)"
  GitOk push origin main
}

Step "Export clean copy of HEAD"
$head = (& git rev-parse --short HEAD 2>$null).Trim()
$tmp = Join-Path $env:TEMP ("bagrut-deploy-" + $head + "-" + (Get-Date -Format "HHmmss"))
New-Item -ItemType Directory -Force $tmp | Out-Null
# checkout-index (not `git archive | tar`): Windows bsdtar chokes on the Hebrew-named tracked docs.
$prefix = ($tmp -replace '\\', '/') + "/"
GitOk checkout-index -a -f "--prefix=$prefix"
# Hebrew-named tracked docs are lesson/teacher notes, not part of the site - keep them out of the upload.
Get-ChildItem -LiteralPath $tmp -Force | Where-Object { $_.Name -match '[^\x00-\x7F]' } | Remove-Item -Recurse -Force
New-Item -ItemType Directory -Force (Join-Path $tmp ".vercel") | Out-Null
if (-not (Test-Path ".vercel\project.json")) { Fail ".vercel\project.json missing - run 'npx vercel link' once (project bagrut-materials)" }
Copy-Item ".vercel\project.json" (Join-Path $tmp ".vercel\project.json")
Write-Host "export: $tmp  (HEAD $head)"

Step "vercel deploy --prod --archive=tgz"
Push-Location $tmp
$out = & npx --yes vercel deploy --prod --yes --archive=tgz --scope $scope 2>&1 | ForEach-Object { "$_" }
$code = $LASTEXITCODE
Pop-Location
$out | ForEach-Object { Write-Host $_ }
if ($code -ne 0) { Fail "vercel deploy failed (exit $code). Live site is unchanged. Temp export kept: $tmp" }
$url = ($out | Select-String -Pattern 'https://bagrut-materials-[a-z0-9]+-[a-z0-9-]+\.vercel\.app' | Select-Object -Last 1).Matches.Value

Step "Verify"
$ls = & npx --yes vercel ls bagrut-materials --scope $scope 2>&1 | ForEach-Object { "$_" }
$ls | Select-Object -First 8 | ForEach-Object { Write-Host $_ }
try {
  $r = Invoke-WebRequest -UseBasicParsing -Uri $site -TimeoutSec 30
  Write-Host "$site -> HTTP $($r.StatusCode)"
  if ($r.StatusCode -ne 200) { Fail "site did not answer 200" }
} catch { Fail "site check failed: $($_.Exception.Message)" }

Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "`nDONE - HEAD $head deployed to production: $url" -ForegroundColor Green
Write-Host "Reminder: hard refresh (Ctrl+F5) to see it. A 'Blocked' deployment for the GitHub push is expected and harmless."
