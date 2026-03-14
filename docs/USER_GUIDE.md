# HeTaoSSH 用户指南

## 简介

HeTaoSSH 是一款现代化的 SSH 客户端，基于 Tauri 2.0 构建，结合了 Rust 的性能优势和 React 的优秀用户体验。

![HeTaoSSH Preview](preview.png)

### 主要特性

- 🔐 **安全的连接管理** - AES-256 加密存储密码和密钥
- 🖥️ **多标签终端** - 同时管理多个 SSH 会话
- ⚡ **高性能终端** - xterm.js + WebGL 加速
- 📁 **远程文件管理** - SFTP 文件浏览器
- 📝 **代码编辑器** - Monaco Editor（VS Code 内核）
- 📊 **系统监控** - CPU、内存、磁盘、网络实时监测
- 🎯 **命令片段** - 快速执行常用命令

## 安装指南

### 发布文件说明 (Assets Guide)

| 文件 (File) | 说明 (Description) |
| :--- | :--- |
| `HeTaoSSH_x.x.x_x64-setup.exe` | **Windows 标准安装包** (推荐)。包含自动更新功能。 |
| `HeTaoSSH_x.x.x_x64.msi` | **Windows MSI 安装包**。适合企业部署或系统管理员使用。 |
| `HeTaoSSH_x.x.x_aarch64.dmg` | **macOS Apple Silicon 安装包**。适用于 M1/M2/M3 芯片 Mac 电脑。 |
| `HeTaoSSH.app.tar.gz` | **macOS 应用程序压缩包**。包含 `.app` 文件。 |
| `latest.json` | **更新元数据**。包含最新版本信息和签名，用于自动更新检查，普通用户**无需下载**。 |

### Windows

1. 从 [Releases](https://github.com/hthappy/HeTaoSSH/releases) 下载 `.exe` (推荐) 或 `.msi` 安装程序
2. 双击运行安装程序
3. 按照安装向导完成安装
4. 在开始菜单中找到 "HeTaoSSH" 并启动

### macOS

> **注意**：目前仅支持 Apple Silicon (M1/M2/M3) 芯片。Intel 芯片 Mac 请自行编译源码。

1. 下载 `HeTaoSSH_x.x.x_aarch64.dmg` 文件
2. 双击打开 `.dmg` 文件
3. 将 HeTaoSSH 图标拖拽到 Applications 文件夹
4. 在 Launchpad 或 Applications 中启动

### Linux

**Debian/Ubuntu:**
```bash
sudo dpkg -i HeTaoSSH_x.x.x_amd64.deb
sudo apt-get install -f  # 修复依赖
```

**AppImage:**
```bash
chmod +x HeTaoSSH_x.x.x_amd64.AppImage
./HeTaoSSH_x.x.x_amd64.AppImage
```

## 快速开始

### 1. 添加第一个服务器

![Server Management](ServersList.png)

1. 点击左侧边栏的 **+** 按钮
2. 填写服务器信息：
   - **Name**: 服务器名称（如 "Production Server"）
   - **Host**: 服务器地址（如 `192.168.1.100` 或 `example.com`）
   - **Port**: SSH 端口（默认 22）
   - **Username**: 用户名
   - **Password**: 密码（或使用密钥认证）
3. 点击 **Add** 保存

### 2. 连接到服务器

1. 在服务器列表中点击服务器
2. 连接成功后，终端标签页会显示绿色连接点
3. 开始输入命令

### 3. 使用远程文件管理器

![File Explorer](Explorer.png)

1. 点击左侧边栏的 **Files** 图标
2. 默认显示当前用户 `home` 目录
3. 输入路径导航到其他目录（如 `/var/www`），支持自动关联补全路径。
4. 点击文件在编辑器中打开

### 4. 编辑远程文件

1. 在文件树中点击文件
2. 在 Monaco 编辑器中编辑内容
3. 按 `Ctrl+S` 或点击 **Save** 保存
4. 编辑器支持语法高亮（自动检测文件类型）

## 功能详解

### 服务器管理

#### 添加服务器

支持两种认证方式：

**密码认证:**
- 填写用户名和密码
- 密码会自动加密存储

**密钥认证:**
- 填写私钥路径（如 `~/.ssh/id_ed25519`）
- 如果私钥有 passphrase，填写 passphrase 字段
- 密码字段留空

#### 测试连接

在保存服务器前，可以点击服务器列表中的测试按钮验证连接信息是否正确。

#### 编辑/删除服务器

- 鼠标悬停在服务器上，显示编辑/删除按钮
- 编辑后点击 **Update** 保存
- 删除需要确认

### 多标签终端

- 每次点击服务器都会打开新标签
- 点击标签切换会话
- 点击 **X** 关闭标签
- 支持同时连接多个服务器

### 终端功能

- **复制**: 选中文本，按 `Ctrl+Shift+C`
- **粘贴**: 按 `Ctrl+Shift+V`
- **全屏**: 双击终端区域
- **搜索**: （Phase 2 待实现）

### 文件编辑器

**支持的语法高亮:**
- JavaScript/TypeScript (`.js`, `.ts`, `.jsx`, `.tsx`)
- Python (`.py`)
- Rust (`.rs`)
- Go (`.go`)
- Java (`.java`)
- C/C++ (`.c`, `.cpp`, `.h`, `.hpp`)
- HTML/CSS (`.html`, `.css`, `.scss`)
- JSON/XML/YAML (`.json`, `.xml`, `.yaml`, `.yml`)
- Markdown (`.md`)
- Shell (`.sh`, `.bash`)
- SQL (`.sql`)
- 以及更多...

**快捷键:**
- `Ctrl+S` - 保存文件
- `Ctrl+Z` - 撤销
- `Ctrl+Y` - 重做
- `Ctrl+F` - 搜索
- `Ctrl+H` - 替换

### 系统监控

点击右侧面板的 **Monitor** 标签查看：

- **CPU 使用率**: 实时百分比
- **内存使用**: 使用量/总量，百分比
- **网络流量**: 接收/发送总量
- **磁盘使用**: 各挂载点使用情况

### 命令片段

![Command Snippets](Snippets.png)

点击右侧面板的 **Snippets** 标签：

**内置命令分类:**
- **System**: 系统信息查询
- **Process**: 进程管理
- **Network**: 网络相关
- **File**: 文件操作
- **Logs**: 日志查看
- **Docker**: Docker 命令
- **Git**: Git 命令

**使用方法:**
1. 点击分类筛选
2. 点击 **Copy** 按钮复制命令
3. 点击 **Play** 按钮执行（待实现）

## 设置

点击右上角的 **⚙️** 按钮打开设置：

### 主题
- **Dark** (默认): 深色主题
- **Light**: 浅色主题

### 终端设置
- **字体大小**: 10px - 24px
- **行高**: 1.0 - 2.0

### 编辑器设置
- **Show Minimap**: 显示代码小地图
- **Word Wrap**: 自动换行

## 状态栏说明

底部状态栏显示：

- **服务器图标**: 当前连接的服务器
- **连接状态**: Connected/Disconnected
- **延迟**: 网络延迟（毫秒）
  - 绿色: < 50ms
  - 黄色: 50-100ms
  - 红色: > 100ms
- **编码**: 终端编码（默认 UTF-8）
- **权限**: 当前文件权限

## 常见问题

### Q: 连接失败怎么办？

A: 检查以下几点：
1. 服务器地址和端口是否正确
2. 用户名和密码是否正确
3. 防火墙是否允许 SSH 连接
4. 服务器 SSH 服务是否运行

### Q: 密钥认证失败？

A: 确保：
1. 私钥路径正确
2. 私钥格式正确（OpenSSH 格式）
3. 如果私钥有 passphrase，正确填写

### Q: 文件保存失败？

A: 检查：
1. 是否有写入权限
2. 磁盘空间是否充足
3. 文件是否被其他进程占用

### Q: 性能问题？

A: 尝试：
1. 减少同时打开的标签数量
2. 降低终端字体大小
3. 禁用编辑器 Minimap

## 安全说明

- 所有密码和密钥使用 AES-256 加密存储
- 加密密钥在每次启动时重新生成
- 建议不要保存敏感服务器的密码
- 定期更新密码

## 技术支持

- **GitHub Issues**: 报告 bug 或请求功能
- **Discussions**: 提问和讨论
- **Email**: support@example.com

## 更新日志

### v0.1.0 (2026-03)
- ✨ 初始版本
- ✨ SSH 连接管理
- ✨ 多标签终端
- ✨ 远程文件浏览器
- ✨ Monaco 编辑器
- ✨ 系统监控
- ✨ 命令片段
