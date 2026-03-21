## Assets Guide / 文件说明

| File / 文件 | Description / 说明 |
|---|---|
| `HeTaoSSH_1.1.1_x64-setup.exe` | **Windows Installer (Recommended)** / Windows 标准安装包（推荐） |
| `HeTaoSSH_1.1.1_x64.msi` | Windows MSI Installer / Windows MSI 安装包（企业部署） |
| `HeTaoSSH_1.1.1_aarch64.dmg` | macOS Apple Silicon Installer / macOS M1/M2/M3 安装包 |
| `latest.json` | Auto-update metadata (Do not download) / 自动更新元数据（无需下载） |

### Installation Guide / 安装指南

**Windows**:
- **Standard Users**: Download `*_setup.exe` for automatic updates
- **Enterprise**: Use `*_x64.msi` for silent deployment (`msiexec /i HeTaoSSH.msi /quiet`)

**Windows**:
- **普通用户**: 下载 `*_setup.exe` 以支持自动更新
- **企业部署**: 使用 `*_x64.msi` 进行静默安装（`msiexec /i HeTaoSSH.msi /quiet`）

> **Note**: macOS builds are processed via GitHub Actions and will appear shortly after release.
> **注意**: macOS 版本由 GitHub Actions 构建，会在发布后稍等片刻出现。