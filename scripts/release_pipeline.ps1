# scripts/release_pipeline.ps1
param (
    [string]$Type = "patch" # patch, minor, major
)

$ErrorActionPreference = "Stop"

# 1. Check Prerequisites
if (-not (Get-Command "gh" -ErrorAction SilentlyContinue)) {
    Write-Warning "GitHub CLI (gh) not found."
    exit 1
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

# 3. Push to GitHub (Required for gh release create)
Write-Host "Pushing changes to GitHub..." -ForegroundColor Green
git push origin main
git push origin --tags

# 4. Build Windows (Local)
Write-Host "Building Windows version locally..." -ForegroundColor Green

# Set Signing Key (Decode base64 to file to ensure correct formatting)
$b64Key = "dW50cnVzdGVkIGNvbW1lbnQ6IHJzaWduIGVuY3J5cHRlZCBzZWNyZXQga2V5ClJXUlRZMEl5VCs1ejN1LzRSNUR2ckRtNXVTaHA5eldyUk9qM2cvZjNLM1hhR0hBYjBSNEFBQkFBQUFBQUFBQUFBQUlBQUFBQWh5RHkwMEFtUi93RlNzaDJzV0FpVFQrUnJNVWNWWm5jQk9LSVQyN0U4ZW0wYklaMFI4bHhuUWdSN2I4TVV0bWw0MGhlaDMwYm9RTC9OYVVPRE5ic2xHUGVBVHBMSUpBRVdrQ3F2Ym83R2UvY1orMjA2dlk2UDNTQXluYnNqRnlHOUs1NkFvTytXN0E9Cg=="
$keyBytes = [System.Convert]::FromBase64String($b64Key)
$keyContent = [System.Text.Encoding]::UTF8.GetString($keyBytes)
$keyPath = Join-Path $PSScriptRoot "private.key"

try {
    Set-Content -Path $keyPath -Value $keyContent -NoNewline -Encoding Ascii
    $env:TAURI_SIGNING_PRIVATE_KEY = $keyPath
    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "hetaossh"

    # Build Frontend
    pnpm build

    # Build Backend & Sign
    pnpm tauri build

    if ($LASTEXITCODE -ne 0) {
        throw "Build failed."
    }

    # 5. Create Release & Upload
    Write-Host "Creating GitHub Release $tagName..." -ForegroundColor Green

    # Create release
    gh release create $tagName --title "HeTaoSSH $tagName" --generate-notes

    # Upload Assets
    Write-Host "Uploading assets..." -ForegroundColor Green
    $bundleDir = "src-tauri/target/release/bundle/msi"
    $nsisDir = "src-tauri/target/release/bundle/nsis"

    $assets = @()

    # Find MSI
    $msi = Get-ChildItem "$bundleDir/*.msi" | Select-Object -First 1
    if ($msi) { $assets += $msi.FullName }

    # Find EXE (NSIS)
    $exe = Get-ChildItem "$nsisDir/*.exe" | Select-Object -First 1
    if ($exe) { $assets += $exe.FullName }

    # Find Update Files (could be in msi or nsis dir)
    $sig = Get-ChildItem "$bundleDir/*.sig" | Select-Object -First 1
    if (-not $sig) { $sig = Get-ChildItem "$nsisDir/*.sig" | Select-Object -First 1 }
    if ($sig) { $assets += $sig.FullName }

    $zip = Get-ChildItem "$bundleDir/*.zip" | Select-Object -First 1
    if (-not $zip) { $zip = Get-ChildItem "$nsisDir/*.zip" | Select-Object -First 1 }
    if ($zip) { $assets += $zip.FullName }

    $latest = Join-Path $bundleDir "latest.json"
    if (-not (Test-Path $latest)) { $latest = Join-Path $nsisDir "latest.json" }
    if (Test-Path $latest) { $assets += $latest }

    if ($assets.Count -gt 0) {
        gh release upload $tagName $assets --clobber
        Write-Host "Assets uploaded successfully." -ForegroundColor Green
    } else {
        throw "Could not find built assets."
    }

    Write-Host "--------------------------------------------------------"
    Write-Host "Release $tagName published!" -ForegroundColor Green
    Write-Host "Windows assets are available immediately."
    Write-Host "macOS build is running in GitHub Actions (will take ~20m)."
    Write-Host "--------------------------------------------------------"

} catch {
    Write-Error $_
    exit 1
} finally {
    # Cleanup key file
    if (Test-Path $keyPath) {
        Remove-Item $keyPath -ErrorAction SilentlyContinue
    }
}
