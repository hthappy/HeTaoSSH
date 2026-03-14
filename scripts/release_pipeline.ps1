# scripts/release_pipeline.ps1
param (
    [string]$Type = "patch" # patch, minor, major
)

$ErrorActionPreference = "Stop"

# 1. Check Prerequisites
if (-not (Get-Command "gh" -ErrorAction SilentlyContinue)) {
    Write-Warning "GitHub CLI (gh) not found."
    Write-Host "Attempting to install via winget..."
    winget install GitHub.cli
    if (-not (Get-Command "gh" -ErrorAction SilentlyContinue)) {
        Write-Error "Failed to install gh. Please install manually."
        exit 1
    }
    # Refresh env vars
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}

# Check gh auth
$authStatus = gh auth status 2>&1
if ($authStatus -match "not logged in") {
    Write-Host "Please login to GitHub CLI:" -ForegroundColor Yellow
    gh auth login
}

# 2. Bump Version & Tag (Local)
Write-Host "Bumping version ($Type)..." -ForegroundColor Green
node scripts/release.js --$Type

# Read new version
$packageJson = Get-Content package.json | ConvertFrom-Json
$version = $packageJson.version
$tagName = "v$version"

# 3. Build Windows (Local)
Write-Host "Building Windows version locally..." -ForegroundColor Green

# Set Signing Key
$env:TAURI_SIGNING_PRIVATE_KEY = "dW50cnVzdGVkIGNvbW1lbnQ6IHJzaWduIGVuY3J5cHRlZCBzZWNyZXQga2V5ClJXUlRZMEl5VCs1ejN1LzRSNUR2ckRtNXVTaHA5eldyUk9qM2cvZjNLM1hhR0hBYjBSNEFBQkFBQUFBQUFBQUFBQUlBQUFBQWh5RHkwMEFtUi93RlNzaDJzV0FpVFQrUnJNVWNWWm5jQk9LSVQyN0U4ZW0wYklaMFI4bHhuUWdSN2I4TVV0bWw0MGhlaDMwYm9RTC9OYVVPRE5ic2xHUGVBVHBMSUpBRVdrQ3F2Ym83R2UvY1orMjA2dlk2UDNTQXluYnNqRnlHOUs1NkFvTytXN0E9Cg=="
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "hetaossh"

# Build Frontend
pnpm build

# Build Backend & Sign
pnpm tauri build

if ($LASTEXITCODE -ne 0) {
    Write-Error "Build failed."
    exit 1
}

# 4. Create Release & Upload (Trigger CI)
Write-Host "Creating GitHub Release $tagName..." -ForegroundColor Green

# Create release (this pushes the tag and triggers CI)
# We use --generate-notes to auto-fill description
gh release create $tagName --title "HeTaoSSH $tagName" --generate-notes

# Upload Assets immediately to beat the CI race condition
Write-Host "Uploading Windows assets..." -ForegroundColor Green
$bundleDir = "src-tauri/target/release/bundle/msi"

# Find files
$msi = Get-ChildItem "$bundleDir/*.msi" | Select-Object -First 1
$zip = Get-ChildItem "$bundleDir/*.zip" | Select-Object -First 1
$sig = Get-ChildItem "$bundleDir/*.sig" | Select-Object -First 1
$latest = Join-Path $bundleDir "latest.json"

if ($msi -and $zip -and $sig -and (Test-Path $latest)) {
    gh release upload $tagName $msi.FullName $zip.FullName $sig.FullName $latest --clobber
    Write-Host "Assets uploaded successfully." -ForegroundColor Green
} else {
    Write-Error "Could not find built assets in $bundleDir"
    exit 1
}

Write-Host "--------------------------------------------------------"
Write-Host "Release $tagName published!" -ForegroundColor Green
Write-Host "Windows assets are available immediately."
Write-Host "macOS build is running in GitHub Actions (will take ~20m)."
Write-Host "--------------------------------------------------------"
