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

# Set Signing Key using Node.js to ensure perfect binary/encoding handling
    $keyFileSource = Join-Path $PSScriptRoot "tauri.key.txt"
    if (-not (Test-Path $keyFileSource)) {
        throw "Key file not found at $keyFileSource. Please create it with your base64 private key."
    }

    $keyPath = Join-Path $PSScriptRoot "private.key"
    
    # Use Node to read base64 from source and write binary to target
    # This avoids all PowerShell string encoding issues
    $nodeScript = "const fs = require('fs'); const b64 = fs.readFileSync('$($keyFileSource.Replace('\', '\\'))', 'utf8').trim(); fs.writeFileSync('$($keyPath.Replace('\', '\\'))', Buffer.from(b64, 'base64'));"
    node -e $nodeScript

    if (-not (Test-Path $keyPath)) {
        throw "Failed to create private key file at $keyPath"
    }
    
    $env:TAURI_SIGNING_PRIVATE_KEY = $keyPath
    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "hetaossh"

    Write-Host "Signing key prepared at: $keyPath" -ForegroundColor Gray
    Write-Host "Key file size: $( (Get-Item $keyPath).Length ) bytes" -ForegroundColor Gray
    Write-Host "Password set (length: $($env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD.Length))" -ForegroundColor Gray

    try {
        # CLEANUP: Remove old bundles to prevent uploading wrong version
        Write-Host "Cleaning up old build artifacts..." -ForegroundColor Gray
    if (Test-Path "src-tauri/target/release/bundle") {
        Remove-Item -Path "src-tauri/target/release/bundle" -Recurse -Force -ErrorAction SilentlyContinue
    }

    # Build Frontend
    Write-Host "Building frontend..." -ForegroundColor Gray
    pnpm build

    # Build Backend & Sign
    Write-Host "Building Tauri backend..." -ForegroundColor Gray
    # Use --verbose to debug signing issues
    pnpm tauri build --verbose

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

    # Find MSI matching version
    $msi = Get-ChildItem "$bundleDir/*$version*.msi" | Select-Object -First 1
    if ($msi) { $assets += $msi.FullName }

    # Find EXE (NSIS) matching version
    $exe = Get-ChildItem "$nsisDir/*$version*.exe" | Select-Object -First 1
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
    
    # CRITICAL CHECK for latest.json
    if (Test-Path $latest) { 
        $assets += $latest 
        Write-Host "Found latest.json at $latest" -ForegroundColor Green
    } else {
        Write-Warning "latest.json NOT FOUND! Auto-update will not work."
        # List directory content for debugging
        Write-Host "Contents of $bundleDir :"
        Get-ChildItem $bundleDir | Select-Object Name | Format-Table -HideTableHeaders
        if (Test-Path $nsisDir) {
            Write-Host "Contents of $nsisDir :"
            Get-ChildItem $nsisDir | Select-Object Name | Format-Table -HideTableHeaders
        }
    }

    if ($assets.Count -gt 0) {
        Write-Host "Uploading $($assets.Count) files..."
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
