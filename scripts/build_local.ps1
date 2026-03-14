$ErrorActionPreference = "Stop"

# 设置签名密钥环境变量 (这是为您生成的密钥)
$env:TAURI_SIGNING_PRIVATE_KEY = "dW50cnVzdGVkIGNvbW1lbnQ6IHJzaWduIGVuY3J5cHRlZCBzZWNyZXQga2V5ClJXUlRZMEl5VCs1ejN1LzRSNUR2ckRtNXVTaHA5eldyUk9qM2cvZjNLM1hhR0hBYjBSNEFBQkFBQUFBQUFBQUFBQUlBQUFBQWh5RHkwMEFtUi93RlNzaDJzV0FpVFQrUnJNVWNWWm5jQk9LSVQyN0U4ZW0wYklaMFI4bHhuUWdSN2I4TVV0bWw0MGhlaDMwYm9RTC9OYVVPRE5ic2xHUGVBVHBMSUpBRVdrQ3F2Ym83R2UvY1orMjA2dlk2UDNTQXluYnNqRnlHOUs1NkFvTytXN0E9Cg=="
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "hetaossh"

Write-Host "1. Building frontend..." -ForegroundColor Green
pnpm build

if ($LASTEXITCODE -ne 0) {
    Write-Error "Frontend build failed"
    exit 1
}

Write-Host "2. Building Tauri app (with signature)..." -ForegroundColor Green
pnpm tauri build

if ($LASTEXITCODE -ne 0) {
    Write-Error "Tauri build failed"
    exit 1
}

Write-Host "3. Opening build output directory..." -ForegroundColor Green
# 尝试打开包含 msi 和 sig 文件的目录
$releaseDir = Join-Path (Get-Location) "src-tauri/target/release/bundle/msi"
if (Test-Path $releaseDir) {
    Invoke-Item $releaseDir
} else {
    Write-Warning "Could not find MSI bundle directory: $releaseDir"
    Invoke-Item "src-tauri/target/release/bundle"
}

Write-Host "Build complete! Please upload the following files to GitHub Release:" -ForegroundColor Yellow
Write-Host "1. HeTaoSSH_x.x.x_x64_en-US.msi"
Write-Host "2. HeTaoSSH_x.x.x_x64_en-US.msi.zip"
Write-Host "3. HeTaoSSH_x.x.x_x64_en-US.msi.zip.sig"
Write-Host "4. latest.json (generated in the bundle directory)"
