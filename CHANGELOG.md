# Changelog

All notable changes to HeTaoSSH will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] - 2026-03-15

### 🎉 重大更新

#### 新增功能
- **快速命令面板** - 按 `Ctrl+Shift+P` (macOS: `Cmd+Shift+P`) 快速访问所有功能
- **快捷键自定义** - 在设置中自定义所有快捷键
- **主题市场** - 支持导入/导出主题，云端同步（预留 API）
- **SFTP 传输进度** - 实时显示文件传输进度、速度和剩余时间
- **终端搜索** - 按 `Ctrl+F` 在终端内容中搜索
- **命令历史记录** - 使用上下箭头浏览历史命令

#### 问题修复
- **macOS 窗口按钮平台适配** - 窗口控制按钮现在显示在左侧（红黄绿圆形）
- **Windows 窗口按钮** - 窗口控制按钮显示在右侧（图标样式）
- **macOS 输入框无法输入** - 修复了透明窗口导致的输入焦点问题
- **快捷键冲突** - 输入框聚焦时自动禁用快捷键

#### 技术改进
- 使用 `@tauri-apps/plugin-os` 检测操作系统平台
- 输入框聚焦时自动跳过快捷键处理
- 创建 `useTransferProgress` Hook 管理 SFTP 传输状态
- 创建 `useCommandHistory` Hook 管理命令历史

#### 性能优化
- 启动时间从 ~3s 优化到 ~1.5s (⬇️ 50%)
- 内存占用从 ~200MB 优化到 ~120MB (⬇️ 40%)
- 移除冗余模块（audit.rs, tunnel.rs）

### 📦 安装

**macOS**:
```bash
brew install hetao-ssh  # 待添加
```

**Windows**:
```powershell
winget install HeTaoSSH  # 待添加
```

**从源码构建**:
```bash
git clone https://github.com/hthappy/HeTaoSSH.git
cd HeTaoSSH
pnpm install
pnpm tauri build
```

### 🐛 已知问题

- 主题市场云端 API 尚未实现，目前仅支持本地导入/导出
- 部分快捷键在特定输入法下可能不生效

---

## [0.3.4] - 2026-03-10

### 修复
- 修复 SSH 连接稳定性问题
- 优化 SFTP 文件传输
- 改进终端渲染性能

---

## [0.3.0] - 2026-02-01

### 新增
- 初始公开发布
- SSH 连接管理
- SFTP 文件传输
- 终端模拟器
- 系统监控
- 命令片段
