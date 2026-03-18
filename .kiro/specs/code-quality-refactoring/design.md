# 技术设计文档 - HeTaoSSH 代码质量整改

## Overview

本设计文档详细说明了 HeTaoSSH 项目代码质量整改的技术实现方案。基于 2026-03-17 的代码审查报告和已完成的需求文档，本次整改将系统性地提升代码质量、可维护性和可扩展性。

### 设计目标

1. **代码整洁性**: 清理所有临时文件，建立清晰的文件组织规范
2. **代码复用性**: 消除重复代码，提取通用逻辑为可复用组件
3. **代码可读性**: 改善注释和文档，统一命名规范
4. **模块化**: 优化项目结构，将大文件拆分为职责清晰的小模块
5. **可测试性**: 添加核心测试，提升测试覆盖率
6. **性能**: 优化数据库查询和前端渲染性能
7. **安全性**: 增强安全机制，改进错误处理
8. **用户体验**: 提供友好的错误提示和加载状态

### 关键约束

- **向后兼容**: 必须保持现有功能完全兼容，不破坏前后端 IPC 接口
- **测试验证**: 所有重构必须通过现有的 8 个路径验证测试
- **轻量级**: 不引入重型依赖，保持应用轻量特性
- **渐进式**: 采用渐进式重构策略，每个模块独立可测试

### 技术栈

- **后端**: Rust (russh, sqlx, tokio, thiserror, aes-gcm)
- **前端**: React + TypeScript + Zustand + xterm.js
- **构建**: Tauri 2.0
- **测试**: cargo test (Rust), Vitest (TypeScript)


## Architecture

### 当前架构分析

HeTaoSSH 采用 Tauri 架构，前后端通过 IPC 通信：

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (React)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Components  │  │    Stores    │  │    Hooks     │      │
│  │  (UI Layer)  │  │  (Zustand)   │  │  (Logic)     │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                  │               │
│         └─────────────────┴──────────────────┘               │
│                           │                                  │
│                    Tauri IPC (invoke)                        │
└───────────────────────────┼──────────────────────────────────┘
                            │
┌───────────────────────────┼──────────────────────────────────┐
│                    Backend (Rust)                            │
│                           │                                  │
│  ┌────────────────────────▼───────────────────────────┐     │
│  │              Commands Layer                        │     │
│  │  (Tauri IPC Handlers - commands.rs)                │     │
│  └────┬──────────┬──────────┬──────────┬──────────────┘     │
│       │          │          │          │                     │
│  ┌────▼────┐ ┌──▼────┐ ┌───▼────┐ ┌───▼────┐               │
│  │   SSH   │ │ SFTP  │ │ Config │ │ System │               │
│  │ Manager │ │Handler│ │Manager │ │Monitor │               │
│  └────┬────┘ └───┬───┘ └───┬────┘ └────────┘               │
│       │          │          │                                │
│  ┌────▼──────────▼──────────▼────────────────┐              │
│  │         Core Services                      │              │
│  │  ┌──────────┐  ┌──────────┐  ┌─────────┐ │              │
│  │  │   SSH    │  │  Crypto  │  │Security │ │              │
│  │  │Connection│  │ (AES-256)│  │  (Path) │ │              │
│  │  └──────────┘  └──────────┘  └─────────┘ │              │
│  └───────────────────────────────────────────┘              │
│                           │                                  │
│  ┌────────────────────────▼───────────────────────────┐     │
│  │              Data Layer                            │     │
│  │         SQLite (sqlx) + Keyring                    │     │
│  └────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────┘
```

### 重构后架构

重构将优化模块组织，提高代码可维护性：


```
src-tauri/src/
├── main.rs                    # Tauri 入口点
├── lib.rs                     # 库导出和 invoke_handler 注册
├── error.rs                   # 统一错误类型 + 错误消息常量
│
├── commands/                  # 【新】IPC 命令模块化
│   ├── mod.rs                # 模块导出
│   ├── sftp.rs               # SFTP 文件操作命令
│   ├── ssh.rs                # SSH 连接管理命令
│   ├── system.rs             # 系统监控命令
│   └── config.rs             # 配置管理命令
│
├── ssh/                       # SSH 核心功能
│   ├── mod.rs
│   ├── connection.rs         # SSH 连接实现
│   ├── handler.rs            # SSH 事件处理
│   ├── manager.rs            # Actor 模型连接管理器
│   └── sftp.rs               # SFTP 协议实现
│
├── config/                    # 配置和数据库
│   ├── mod.rs                # ConfigManager + 数据库迁移
│   └── migrations.rs         # 【新】数据库索引优化
│
├── crypto/                    # 加密服务
│   └── mod.rs                # AES-256-GCM 加密管理器
│
├── security/                  # 安全模块
│   ├── mod.rs
│   ├── path_validation.rs    # 路径遍历防护
│   └── validation.rs         # 【新】统一验证函数
│
├── monitor.rs                 # 系统监控
├── snippets.rs                # 代码片段管理
└── local_term.rs              # 本地终端
```

**关键改进**:
1. **commands/ 模块化**: 将 600+ 行的 commands.rs 拆分为 4 个职责清晰的子模块
2. **security/validation.rs**: 提取重复的路径验证逻辑
3. **error.rs 增强**: 添加错误消息常量模块
4. **config/migrations.rs**: 独立的数据库优化逻辑


## Components and Interfaces

### 1. 文件清理策略

#### 1.1 临时文件清理

**目标文件**:
- `src-tauri/check_output.txt`
- `src-tauri/output.txt`
- `src-tauri/output_utf8.txt`
- `src-tauri/test_output.log`
- `src-tauri/HetaoSSH/hetaossh.db` (开发数据库)

**实施方案**:
```bash
# 1. 删除临时文件
rm src-tauri/*.txt src-tauri/*.log

# 2. 更新 .gitignore
echo "src-tauri/*.txt" >> .gitignore
echo "src-tauri/*.log" >> .gitignore
echo "src-tauri/HetaoSSH/" >> .gitignore
```

**验证**: 运行 `git status` 确认这些文件不再被跟踪

#### 1.2 草稿文件整理

**当前状态**: `.sisyphus/drafts/` 包含 5 个草稿文档

**整理策略**:
- `implementation-plan-revised.md` → 删除（已过时）
- `implementation-plan.md` → 删除（已过时）
- `integration-test-report.md` → 迁移到 `docs/testing/`
- `quick-reference.md` → 合并到 `AGENTS.md`
- `security-performance-status.md` → 迁移到 `docs/security/`

**新文档结构**:
```
docs/
├── API.md                     # 现有
├── USER_GUIDE.md              # 现有
├── architecture.md            # 【新】系统架构
├── data-flow.md               # 【新】数据流图
├── security-model.md          # 【新】安全模型
└── testing/
    └── integration-tests.md   # 【迁移】集成测试报告
```

#### 1.3 无用代码清理

**目标**:
- 删除 `web/vite.config.js`（保留 `vite.config.ts`）
- 删除 `src-tauri/src/crypto/mod.rs` 中的测试注释
- 运行 `pnpm lint --fix` 清理未使用的导入

### 2. 代码重复消除

#### 2.1 路径验证统一

**当前问题**: 8 个 SFTP 命令中重复相同的路径验证代码

**解决方案**: 创建 `src-tauri/src/security/validation.rs`

```rust
// src-tauri/src/security/validation.rs
use crate::error::{Result, SshError};
use crate::security::path_validation::contains_traversal_pattern;

/// 统一的路径验证函数
/// 
/// 在所有 SFTP 操作前调用，防止路径遍历攻击
pub fn validate_sftp_path(path: &str) -> Result<()> {
    if contains_traversal_pattern(path) {
        return Err(SshError::Config(
            crate::error::messages::PATH_TRAVERSAL.into()
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_safe_paths() {
        assert!(validate_sftp_path("file.txt").is_ok());
        assert!(validate_sftp_path("dir/file.txt").is_ok());
    }

    #[test]
    fn test_validate_dangerous_paths() {
        assert!(validate_sftp_path("../etc/passwd").is_err());
        assert!(validate_sftp_path("file\0.txt").is_err());
    }
}
```

**使用示例**:
```rust
// 重构前 (commands.rs)
pub async fn sftp_list_dir(path: String, ...) -> Result<Vec<SftpEntry>> {
    if contains_traversal_pattern(&path) {
        return Err(SshError::Config("Path traversal detected...".into()));
    }
    // 实现逻辑
}

// 重构后 (commands/sftp.rs)
use crate::security::validation::validate_sftp_path;

pub async fn sftp_list_dir(path: String, ...) -> Result<Vec<SftpEntry>> {
    validate_sftp_path(&path)?;
    // 实现逻辑
}
```

**影响范围**: 8 个 SFTP 命令函数
**代码减少**: ~40 行重复代码


#### 2.2 本地/远程文件系统抽象

**当前问题**: 每个 SFTP 命令都重复判断 `tab_id.starts_with("local-")`

**解决方案**: 使用枚举抽象文件系统后端

```rust
// src-tauri/src/commands/sftp.rs

/// 文件系统后端抽象
enum FileSystemBackend<'a> {
    Local,
    Remote(&'a Arc<ConnectionManager>, &'a str), // (manager, tab_id)
}

impl<'a> FileSystemBackend<'a> {
    /// 根据 tab_id 创建后端
    fn from_tab_id(
        tab_id: &'a str,
        manager: &'a Arc<ConnectionManager>
    ) -> Self {
        if tab_id.starts_with("local-") {
            Self::Local
        } else {
            Self::Remote(manager, tab_id)
        }
    }

    /// 列出目录
    async fn list_dir(&self, path: &str) -> Result<Vec<SftpEntry>> {
        match self {
            Self::Local => local_list_dir(path.to_string()).await,
            Self::Remote(manager, tab_id) => {
                manager.sftp_list_dir(tab_id, path).await
            }
        }
    }

    /// 读取文件
    async fn read_file(&self, path: &str) -> Result<Vec<u8>> {
        match self {
            Self::Local => {
                std::fs::read(path).map_err(|e| SshError::Io(e))
            }
            Self::Remote(manager, tab_id) => {
                manager.sftp_read_file(tab_id, path).await
            }
        }
    }

    // 其他文件操作方法...
}
```

**使用示例**:
```rust
// 重构前
pub async fn sftp_list_dir(
    tab_id: String,
    path: String,
    state: State<'_, Arc<ConnectionManager>>
) -> Result<Vec<SftpEntry>> {
    validate_sftp_path(&path)?;
    
    if tab_id.starts_with("local-") {
        return local_list_dir(path).await;
    }
    state.sftp_list_dir(&tab_id, &path).await
}

// 重构后
pub async fn sftp_list_dir(
    tab_id: String,
    path: String,
    state: State<'_, Arc<ConnectionManager>>
) -> Result<Vec<SftpEntry>> {
    validate_sftp_path(&path)?;
    
    let backend = FileSystemBackend::from_tab_id(&tab_id, &state);
    backend.list_dir(&path).await
}
```

**优点**:
- 消除重复的 if-else 判断
- 统一的接口，易于扩展（如添加云存储后端）
- 更好的类型安全

#### 2.3 前端终端 Fit 逻辑复用

**当前问题**: `Terminal.tsx` 中 `fitTerminal()` 逻辑重复 5+ 次

**解决方案**: 提取为自定义 Hook

```typescript
// web/src/hooks/useTerminalFit.ts
import { useCallback, useRef } from 'react';
import type { Terminal } from 'xterm';
import type { FitAddon } from 'xterm-addon-fit';

export function useTerminalFit() {
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  const fitTerminal = useCallback(() => {
    if (!xtermRef.current || !fitAddonRef.current) {
      return;
    }
    
    try {
      fitAddonRef.current.fit();
    } catch (error) {
      console.error('Failed to fit terminal:', error);
    }
  }, []);

  return {
    xtermRef,
    fitAddonRef,
    fitTerminal
  };
}
```

**使用示例**:
```typescript
// web/src/components/Terminal.tsx
import { useTerminalFit } from '@/hooks/useTerminalFit';

export function Terminal() {
  const { xtermRef, fitAddonRef, fitTerminal } = useTerminalFit();

  useEffect(() => {
    // 窗口大小变化时自动调整
    window.addEventListener('resize', fitTerminal);
    return () => window.removeEventListener('resize', fitTerminal);
  }, [fitTerminal]);

  // 其他地方直接调用 fitTerminal()
}
```


### 3. 代码规范改进

#### 3.1 错误消息常量化

**目标**: 统一管理所有错误消息，便于国际化和维护

```rust
// src-tauri/src/error.rs

pub mod messages {
    // 路径安全
    pub const PATH_TRAVERSAL: &str = 
        "Path traversal detected: suspicious pattern in path";
    
    // 连接错误
    pub const CONNECTION_TIMEOUT: &str = 
        "Connection timed out after 15 seconds";
    pub const CONNECTION_FAILED: &str = 
        "Failed to establish SSH connection";
    pub const AUTH_FAILED: &str = 
        "Authentication failed: invalid credentials";
    
    // SFTP 错误
    pub const SFTP_NOT_INITIALIZED: &str = 
        "SFTP session not initialized";
    pub const SFTP_FILE_NOT_FOUND: &str = 
        "File or directory not found";
    pub const SFTP_PERMISSION_DENIED: &str = 
        "Permission denied";
    
    // 加密错误
    pub const ENCRYPTION_FAILED: &str = 
        "Failed to encrypt data";
    pub const DECRYPTION_FAILED: &str = 
        "Failed to decrypt data: password may be corrupted";
    pub const KEYRING_ACCESS_FAILED: &str = 
        "Failed to access system keyring";
    
    // 配置错误
    pub const INVALID_CONFIG: &str = 
        "Invalid server configuration";
    pub const DATABASE_ERROR: &str = 
        "Database operation failed";
}
```

**使用示例**:
```rust
// 重构前
return Err(SshError::Config("Path traversal detected...".into()));

// 重构后
use crate::error::messages;
return Err(SshError::Config(messages::PATH_TRAVERSAL.into()));
```

#### 3.2 魔法数字常量化

**目标**: 将所有硬编码数值定义为命名常量

```rust
// src-tauri/src/ssh/manager.rs

/// SSH 连接超时时间（秒）
const CONNECTION_TIMEOUT_SECS: u64 = 15;

/// 最大重连次数
const MAX_RECONNECT_ATTEMPTS: usize = 2;

/// 系统监控数据刷新间隔（秒）
const MONITOR_REFRESH_INTERVAL_SECS: u64 = 2;

// 使用
tokio::time::timeout(
    Duration::from_secs(CONNECTION_TIMEOUT_SECS),
    connection.connect()
).await?;
```

```typescript
// web/src/stores/ssh-store.ts

/** IPC 防抖延迟（毫秒） */
const IPC_DEBOUNCE_MS = 5;

/** IPC 最大等待时间（毫秒） */
const IPC_MAX_WAIT_MS = 150;

// 使用
setTimeout(async () => {
  // ...
}, IPC_DEBOUNCE_MS);
```

#### 3.3 文档注释规范

**目标**: 为所有公共 API 和复杂逻辑添加文档注释

```rust
// src-tauri/src/ssh/manager.rs

/// SSH 连接 Actor 任务
///
/// 该 Actor 独占一个 SshConnection，通过 mpsc channel 接收命令。
/// 采用 Actor 模型避免了锁竞争，每个连接在独立的 tokio 任务中运行。
///
/// # 职责
/// - 处理终端数据收发
/// - 执行 SFTP 文件操作
/// - 实现自动重连机制（最多 2 次）
/// - 收集系统监控数据
///
/// # 生命周期
/// - 创建: `ConnectionManager::create_connection()` 时启动
/// - 运行: 持续监听 `ConnCommand` 消息
/// - 销毁: 收到 `Disconnect` 命令或连接失败时退出
///
/// # 错误处理
/// - 连接断开: 自动尝试重连（最多 2 次）
/// - 重连失败: 发送 `ssh-disconnected` 事件到前端
/// - SFTP 错误: 通过 oneshot channel 返回给调用者
async fn connection_actor(
    id: String,
    mut conn: SshConnection,
    mut rx: mpsc::Receiver<ConnCommand>,
    app_handle: tauri::AppHandle,
) {
    // 实现...
}
```


### 4. 模块重组方案

#### 4.1 Commands 模块拆分

**目标**: 将 600+ 行的 `commands.rs` 拆分为 4 个子模块

**拆分策略**:

```rust
// src-tauri/src/commands/mod.rs
mod sftp;
mod ssh;
mod system;
mod config;

// 重新导出所有命令
pub use sftp::*;
pub use ssh::*;
pub use system::*;
pub use config::*;
```

**模块职责**:

1. **sftp.rs** (SFTP 文件操作)
   - `sftp_list_dir`
   - `sftp_read_file`
   - `sftp_write_file`
   - `sftp_remove_file`
   - `sftp_create_dir`
   - `sftp_download_file`
   - `sftp_download_dir`
   - `sftp_upload_file`
   - `sftp_get_home_dir`
   - `local_list_dir`
   - `local_get_home_dir`

2. **ssh.rs** (SSH 连接管理)
   - `ssh_connect`
   - `ssh_disconnect`
   - `ssh_send`
   - `ssh_recv`
   - `ssh_resize`
   - `test_connection`

3. **system.rs** (系统监控和工具)
   - `get_system_usage`
   - `fetch_url`
   - `open_local_terminal`
   - `local_term_write`
   - `local_term_resize`
   - `local_term_close`

4. **config.rs** (配置和数据管理)
   - `list_servers`
   - `save_server`
   - `delete_server`
   - `save_session`
   - `get_session`
   - `list_snippets`
   - `list_snippet_categories`
   - `save_snippet`
   - `delete_snippet`
   - `parse_theme`
   - `ping`
   - `get_version`


**迁移步骤**:

1. 创建 `src-tauri/src/commands/` 目录
2. 创建 4 个子模块文件
3. 将对应函数移动到各自模块
4. 更新 `mod.rs` 导出
5. 更新 `src-tauri/src/lib.rs` 中的导入路径
6. 运行 `cargo check` 验证编译
7. 运行 `cargo test` 验证功能

**向后兼容性**: 通过 `pub use` 重新导出，前端调用的命令名称保持不变

#### 4.2 前端 App.tsx 组件拆分

**目标**: 将 500+ 行的 `App.tsx` 拆分为更小的子组件

**拆分策略**:

```
web/src/
├── App.tsx                    # 主布局和路由
├── components/
│   ├── layout/
│   │   ├── WorkspaceArea.tsx  # 标签页工作区
│   │   ├── SidebarArea.tsx    # 侧边栏（服务器列表/文件树）
│   │   └── ContentArea.tsx    # 内容区（终端/编辑器）
│   ├── Terminal.tsx           # 现有
│   ├── FileTree.tsx           # 现有
│   └── ...
```

**WorkspaceArea.tsx** (标签页管理):
```typescript
interface WorkspaceAreaProps {
  tabs: Tab[];
  activeTabId: string;
  onTabChange: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
}

export function WorkspaceArea({ tabs, activeTabId, ... }: WorkspaceAreaProps) {
  return (
    <div className="workspace-area">
      <TabBar tabs={tabs} activeId={activeTabId} ... />
      <TabContent activeTab={tabs.find(t => t.id === activeTabId)} />
    </div>
  );
}
```

**SidebarArea.tsx** (侧边栏):
```typescript
interface SidebarAreaProps {
  view: 'servers' | 'files' | 'snippets';
  onViewChange: (view: string) => void;
}

export function SidebarArea({ view, onViewChange }: SidebarAreaProps) {
  return (
    <aside className="sidebar-area">
      <SidebarNav view={view} onViewChange={onViewChange} />
      {view === 'servers' && <ServerList />}
      {view === 'files' && <FileTree />}
      {view === 'snippets' && <SnippetList />}
    </aside>
  );
}
```

**优点**:
- 每个组件职责单一，易于理解和测试
- 减少 App.tsx 的复杂度
- 提高组件复用性


### 5. 错误处理统一

#### 5.1 密码解密失败处理

**当前问题**: 解密失败时静默返回 None，用户不知道密码丢失

**解决方案**:
```rust
// src-tauri/src/config/mod.rs

pub async fn get_server(&self, id: i64) -> Result<ServerConfig> {
    let row = sqlx::query("SELECT * FROM servers WHERE id = ?")
        .bind(id)
        .fetch_one(&self.pool)
        .await?;

    let password = if let Some(enc) = row.get::<Option<String>, _>("password") {
        match self.crypto.decrypt(&enc) {
            Ok(p) => Some(p),
            Err(e) => {
                log::error!("Password decryption failed for server {}: {}", id, e);
                // 返回明确错误，前端提示用户重新输入密码
                return Err(SshError::Encryption(
                    messages::DECRYPTION_FAILED.into()
                ));
            }
        }
    } else {
        None
    };

    Ok(ServerConfig {
        id: Some(id),
        password,
        // 其他字段...
    })
}
```

**前端处理**:
```typescript
// web/src/stores/ssh-store.ts

async function loadServer(id: number) {
  try {
    const server = await invoke<ServerConfig>('get_server', { id });
    return server;
  } catch (error) {
    if (error.includes('decrypt')) {
      // 提示用户密码已损坏，需要重新输入
      toast.error(t('errors.password_corrupted'));
      // 打开服务器编辑对话框
      openServerEditDialog(id);
    } else {
      toast.error(t('errors.load_server_failed'));
    }
  }
}
```

#### 5.2 前端错误消息友好化

**目标**: 将技术错误转换为用户友好的本地化消息

```typescript
// web/src/utils/errorMessages.ts

export function getFriendlyErrorMessage(error: string, t: TFunction): string {
  // 连接错误
  if (error.includes('Connection refused')) {
    return t('errors.connection_refused', 
      '无法连接到服务器，请检查地址和端口是否正确');
  }
  
  if (error.includes('Connection timed out')) {
    return t('errors.connection_timeout',
      '连接超时，请检查网络连接和服务器状态');
  }
  
  // 认证错误
  if (error.includes('Authentication failed')) {
    return t('errors.auth_failed',
      '用户名或密码错误，请检查登录凭据');
  }
  
  if (error.includes('Permission denied')) {
    return t('errors.permission_denied',
      '权限不足，无法访问该资源');
  }
  
  // 文件操作错误
  if (error.includes('File not found') || error.includes('No such file')) {
    return t('errors.file_not_found',
      '文件或目录不存在');
  }
  
  if (error.includes('Path traversal')) {
    return t('errors.path_traversal',
      '路径包含非法字符，操作被拒绝');
  }
  
  // 加密错误
  if (error.includes('decrypt')) {
    return t('errors.decryption_failed',
      '密码解密失败，可能已损坏，请重新输入');
  }
  
  // 默认返回原始错误
  return error;
}
```

**使用示例**:
```typescript
import { getFriendlyErrorMessage } from '@/utils/errorMessages';

try {
  await invoke('ssh_connect', { config });
} catch (error) {
  const message = getFriendlyErrorMessage(String(error), t);
  toast.error(message);
}
```


### 6. 性能优化方案

#### 6.1 数据库索引优化

**目标**: 为常用查询字段添加索引，提升查询性能

```rust
// src-tauri/src/config/migrations.rs

/// 数据库性能优化迁移
pub async fn apply_performance_optimizations(pool: &SqlitePool) -> Result<()> {
    // 为 servers 表添加索引
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_servers_host 
         ON servers(host)"
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_servers_name 
         ON servers(name)"
    )
    .execute(pool)
    .await?;

    // 为 snippets 表添加索引
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_snippets_category 
         ON snippets(category)"
    )
    .execute(pool)
    .await?;

    log::info!("Database performance optimizations applied");
    Ok(())
}
```

**调用时机**: 在 `ConfigManager::new()` 中调用

```rust
impl ConfigManager {
    pub async fn new(app_handle: tauri::AppHandle) -> Result<Self> {
        let pool = /* 初始化连接池 */;
        
        // 应用数据库迁移
        migrations::apply_performance_optimizations(&pool).await?;
        
        Ok(Self { pool, crypto, app_handle })
    }
}
```

#### 6.2 批量 SFTP 操作

**目标**: 减少 IPC 调用次数，提升批量文件操作性能

```rust
// src-tauri/src/commands/sftp.rs

/// 批量下载文件
#[tauri::command]
pub async fn sftp_batch_download(
    tab_id: String,
    files: Vec<(String, String)>, // (remote_path, local_path) pairs
    state: State<'_, Arc<ConnectionManager>>
) -> Result<Vec<Result<()>>> {
    let mut results = Vec::new();
    
    for (remote_path, local_path) in files {
        // 验证路径
        validate_sftp_path(&remote_path)?;
        
        // 执行下载
        let result = if tab_id.starts_with("local-") {
            // 本地文件复制
            std::fs::copy(&remote_path, &local_path)
                .map(|_| ())
                .map_err(SshError::from)
        } else {
            // 远程文件下载
            state.sftp_download_file(&tab_id, &remote_path, &local_path).await
        };
        
        results.push(result);
    }
    
    Ok(results)
}

/// 批量上传文件
#[tauri::command]
pub async fn sftp_batch_upload(
    tab_id: String,
    files: Vec<(String, String)>, // (local_path, remote_path) pairs
    state: State<'_, Arc<ConnectionManager>>
) -> Result<Vec<Result<()>>> {
    let mut results = Vec::new();
    
    for (local_path, remote_path) in files {
        validate_sftp_path(&remote_path)?;
        
        let result = state.sftp_upload_file(&tab_id, &local_path, &remote_path).await;
        results.push(result);
    }
    
    Ok(results)
}
```

**前端使用**:
```typescript
// 批量下载
const files = selectedFiles.map(f => [f.remotePath, f.localPath]);
const results = await invoke<Result<void>[]>('sftp_batch_download', {
  tabId: activeTab.id,
  files
});

// 检查结果
const failed = results.filter(r => r.error);
if (failed.length > 0) {
  toast.error(`${failed.length} 个文件下载失败`);
}
```


#### 6.3 前端性能优化

**目标**: 减少不必要的重渲染，优化组件性能

**优化 1: useMemo 依赖优化**
```typescript
// web/src/App.tsx

// 重构前：依赖项过多，频繁重新计算
const displayServerName = useMemo(() => {
  if (!activeTab || !activeServer) return '';
  return `${activeServer.name} (${activeServer.host})`;
}, [activeTab, activeServer, t]); // t 变化会导致重新计算

// 重构后：提取为纯函数
function getDisplayServerName(server: ServerConfig | null): string {
  if (!server) return '';
  return `${server.name} (${server.host})`;
}

// 组件中直接调用
const displayServerName = getDisplayServerName(activeServer);
```

**优化 2: React.memo 包装纯组件**
```typescript
// web/src/components/ServerListItem.tsx

interface ServerListItemProps {
  server: ServerConfig;
  isActive: boolean;
  onSelect: (id: number) => void;
  onDelete: (id: number) => void;
}

// 使用 memo 避免父组件重渲染时不必要的更新
export const ServerListItem = React.memo(function ServerListItem({
  server,
  isActive,
  onSelect,
  onDelete
}: ServerListItemProps) {
  return (
    <div className={cn('server-item', isActive && 'active')}>
      {/* 渲染逻辑 */}
    </div>
  );
});
```

**优化 3: 虚拟滚动（大列表）**
```typescript
// web/src/components/FileTree.tsx
import { useVirtualizer } from '@tanstack/react-virtual';

export function FileTree({ files }: { files: FileEntry[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: files.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32, // 每项高度
    overscan: 5 // 预渲染项数
  });

  return (
    <div ref={parentRef} className="file-tree">
      <div style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map(virtualItem => (
          <FileItem
            key={virtualItem.key}
            file={files[virtualItem.index]}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualItem.start}px)`
            }}
          />
        ))}
      </div>
    </div>
  );
}
```


### 7. 安全性增强

#### 7.1 CSP 配置

**目标**: 配置内容安全策略，防止 XSS 攻击

```json
// src-tauri/tauri.conf.json

{
  "app": {
    "security": {
      "csp": {
        "default-src": "'self'",
        "style-src": "'self' 'unsafe-inline'",
        "script-src": "'self'",
        "img-src": "'self' data:",
        "font-src": "'self' data:",
        "connect-src": "'self' tauri:"
      }
    }
  }
}
```

**说明**:
- `default-src 'self'`: 默认只允许加载本地资源
- `style-src 'unsafe-inline'`: 允许内联样式（React 需要）
- `connect-src tauri:`: 允许 Tauri IPC 通信

#### 7.2 密码强度验证

**目标**: 在保存服务器配置时验证密码强度

```typescript
// web/src/utils/passwordStrength.ts

export type PasswordStrength = 'weak' | 'medium' | 'strong';

export function validatePasswordStrength(password: string): PasswordStrength {
  if (password.length < 8) {
    return 'weak';
  }
  
  let score = 0;
  
  // 包含大写字母
  if (/[A-Z]/.test(password)) score++;
  
  // 包含小写字母
  if (/[a-z]/.test(password)) score++;
  
  // 包含数字
  if (/[0-9]/.test(password)) score++;
  
  // 包含特殊字符
  if (/[^A-Za-z0-9]/.test(password)) score++;
  
  // 长度超过 12
  if (password.length >= 12) score++;
  
  if (score >= 4) return 'strong';
  if (score >= 2) return 'medium';
  return 'weak';
}
```

**UI 集成**:
```typescript
// web/src/components/ServerFormDialog.tsx

export function ServerFormDialog() {
  const [password, setPassword] = useState('');
  const strength = validatePasswordStrength(password);

  return (
    <div>
      <Input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <PasswordStrengthIndicator strength={strength} />
      {strength === 'weak' && (
        <p className="text-yellow-600">
          {t('password.weak_warning', '密码强度较弱，建议使用更复杂的密码')}
        </p>
      )}
    </div>
  );
}
```

#### 7.3 会话空闲超时

**目标**: 自动断开长时间无活动的 SSH 连接

```rust
// src-tauri/src/ssh/manager.rs

/// 空闲超时时间（秒）
const IDLE_TIMEOUT_SECS: u64 = 1800; // 30 分钟

async fn connection_actor(
    id: String,
    mut conn: SshConnection,
    mut rx: mpsc::Receiver<ConnCommand>,
    app_handle: tauri::AppHandle,
) {
    let mut last_activity = Instant::now();
    let idle_timeout = Duration::from_secs(IDLE_TIMEOUT_SECS);

    loop {
        tokio::select! {
            // 接收命令
            Some(cmd) = rx.recv() => {
                last_activity = Instant::now(); // 更新活动时间
                
                match cmd {
                    // 处理命令...
                }
            }
            
            // 检查空闲超时
            _ = tokio::time::sleep(Duration::from_secs(60)) => {
                if last_activity.elapsed() > idle_timeout {
                    log::info!("Connection {} idle timeout, disconnecting", id);
                    
                    // 发送超时事件到前端
                    let _ = app_handle.emit("ssh-idle-timeout", &id);
                    
                    break; // 退出 actor
                }
            }
        }
    }
}
```

**前端处理**:
```typescript
// web/src/stores/ssh-store.ts

listen('ssh-idle-timeout', (event) => {
  const tabId = event.payload as string;
  
  toast.warning(
    t('connection.idle_timeout', '连接因长时间无活动已断开'),
    { duration: 5000 }
  );
  
  // 更新 UI 状态
  updateTabStatus(tabId, 'disconnected');
});
```


### 8. 用户体验改进

#### 8.1 加载状态骨架屏

**目标**: 在数据加载时显示骨架屏，提升感知性能

```typescript
// web/src/components/FileTree.tsx

export function FileTree() {
  const { files, isLoading } = useFileTree();

  if (isLoading) {
    return <FileTreeSkeleton />;
  }

  return <FileList files={files} />;
}

// web/src/components/FileTreeSkeleton.tsx
export function FileTreeSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center space-x-2 animate-pulse">
          <div className="h-4 w-4 bg-gray-700 rounded" />
          <div className="h-4 flex-1 bg-gray-700 rounded" />
        </div>
      ))}
    </div>
  );
}
```

#### 8.2 操作进度反馈

**目标**: 为长时间操作提供进度反馈

```typescript
// web/src/components/FileUploadProgress.tsx

interface UploadTask {
  id: string;
  filename: string;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
}

export function FileUploadProgress() {
  const { uploadTasks } = useUploadStore();

  return (
    <div className="upload-progress-panel">
      {uploadTasks.map(task => (
        <div key={task.id} className="upload-item">
          <div className="flex items-center justify-between">
            <span>{task.filename}</span>
            <span>{task.progress}%</span>
          </div>
          <Progress value={task.progress} />
          {task.status === 'error' && (
            <p className="text-red-500 text-sm">上传失败</p>
          )}
        </div>
      ))}
    </div>
  );
}
```

**后端支持**:
```rust
// src-tauri/src/commands/sftp.rs

#[tauri::command]
pub async fn sftp_upload_file_with_progress(
    tab_id: String,
    local_path: String,
    remote_path: String,
    app_handle: tauri::AppHandle,
    state: State<'_, Arc<ConnectionManager>>
) -> Result<()> {
    validate_sftp_path(&remote_path)?;
    
    let file_size = std::fs::metadata(&local_path)?.len();
    let mut uploaded = 0u64;
    
    // 分块上传并报告进度
    const CHUNK_SIZE: usize = 32768; // 32KB
    let mut file = std::fs::File::open(&local_path)?;
    let mut buffer = vec![0u8; CHUNK_SIZE];
    
    while let Ok(n) = file.read(&mut buffer) {
        if n == 0 { break; }
        
        // 上传块
        state.sftp_write_chunk(&tab_id, &remote_path, &buffer[..n]).await?;
        
        uploaded += n as u64;
        let progress = (uploaded as f64 / file_size as f64 * 100.0) as u32;
        
        // 发送进度事件
        let _ = app_handle.emit("upload-progress", json!({
            "file": local_path,
            "progress": progress
        }));
    }
    
    Ok(())
}
```


### 9. Bug 修复

#### 9.1 输入缓冲区竞态条件

**当前问题**: `inputBuffers` 和 `inputTimers` 是全局对象，快速切换标签时可能出现竞态

**解决方案**: 移到 Zustand store 内部管理

```typescript
// web/src/stores/ssh-store.ts

interface SshState {
  connections: Map<number, Connection>;
  inputBuffers: Record<number, string>;
  inputTimers: Record<number, NodeJS.Timeout>;
  
  // Actions
  sendToTerminal: (serverId: number, data: string) => void;
  clearInputBuffer: (serverId: number) => void;
}

export const useSshStore = create<SshState>((set, get) => ({
  connections: new Map(),
  inputBuffers: {},
  inputTimers: {},

  sendToTerminal: (serverId: number, data: string) => {
    const state = get();
    
    // 追加到缓冲区
    const currentBuffer = state.inputBuffers[serverId] || '';
    set({
      inputBuffers: {
        ...state.inputBuffers,
        [serverId]: currentBuffer + data
      }
    });
    
    // 如果已有定时器，不创建新的
    if (state.inputTimers[serverId]) {
      return;
    }
    
    // 创建防抖定时器
    const timer = setTimeout(async () => {
      const { inputBuffers, inputTimers } = get();
      const payload = inputBuffers[serverId] || '';
      
      // 清空缓冲区和定时器
      set({
        inputBuffers: { ...inputBuffers, [serverId]: '' },
        inputTimers: { ...inputTimers, [serverId]: undefined }
      });
      
      // 发送数据
      await invoke('ssh_send', { 
        tabId: `conn-${serverId}`, 
        data: payload 
      });
    }, IPC_DEBOUNCE_MS);
    
    set({
      inputTimers: {
        ...state.inputTimers,
        [serverId]: timer
      }
    });
  },

  clearInputBuffer: (serverId: number) => {
    const { inputTimers } = get();
    
    // 清除定时器
    if (inputTimers[serverId]) {
      clearTimeout(inputTimers[serverId]);
    }
    
    // 清空缓冲区
    set({
      inputBuffers: { ...get().inputBuffers, [serverId]: '' },
      inputTimers: { ...inputTimers, [serverId]: undefined }
    });
  }
}));
```

**组件卸载时清理**:
```typescript
// web/src/components/Terminal.tsx

useEffect(() => {
  return () => {
    // 组件卸载时清理缓冲区
    clearInputBuffer(serverId);
  };
}, [serverId, clearInputBuffer]);
```


## Data Models

### 1. 错误消息常量

```rust
// src-tauri/src/error.rs

pub mod messages {
    // 路径安全
    pub const PATH_TRAVERSAL: &str = 
        "Path traversal detected: suspicious pattern in path";
    
    // 连接错误
    pub const CONNECTION_TIMEOUT: &str = 
        "Connection timed out after 15 seconds";
    pub const CONNECTION_FAILED: &str = 
        "Failed to establish SSH connection";
    pub const AUTH_FAILED: &str = 
        "Authentication failed: invalid credentials";
    
    // SFTP 错误
    pub const SFTP_NOT_INITIALIZED: &str = 
        "SFTP session not initialized";
    pub const SFTP_FILE_NOT_FOUND: &str = 
        "File or directory not found";
    pub const SFTP_PERMISSION_DENIED: &str = 
        "Permission denied";
    
    // 加密错误
    pub const ENCRYPTION_FAILED: &str = 
        "Failed to encrypt data";
    pub const DECRYPTION_FAILED: &str = 
        "Failed to decrypt data: password may be corrupted";
    pub const KEYRING_ACCESS_FAILED: &str = 
        "Failed to access system keyring";
    
    // 配置错误
    pub const INVALID_CONFIG: &str = 
        "Invalid server configuration";
    pub const DATABASE_ERROR: &str = 
        "Database operation failed";
}
```

### 2. 常量定义

```rust
// src-tauri/src/ssh/manager.rs

/// SSH 连接超时时间（秒）
pub const CONNECTION_TIMEOUT_SECS: u64 = 15;

/// 最大重连次数
pub const MAX_RECONNECT_ATTEMPTS: usize = 2;

/// 系统监控数据刷新间隔（秒）
pub const MONITOR_REFRESH_INTERVAL_SECS: u64 = 2;

/// 空闲超时时间（秒）- 30 分钟
pub const IDLE_TIMEOUT_SECS: u64 = 1800;
```

```typescript
// web/src/constants/ipc.ts

/** IPC 防抖延迟（毫秒） */
export const IPC_DEBOUNCE_MS = 5;

/** IPC 最大等待时间（毫秒） */
export const IPC_MAX_WAIT_MS = 150;

/** 文件上传分块大小（字节） */
export const UPLOAD_CHUNK_SIZE = 32768; // 32KB
```

### 3. 文件系统后端抽象

```rust
// src-tauri/src/commands/sftp.rs

/// 文件系统后端抽象
enum FileSystemBackend<'a> {
    Local,
    Remote(&'a Arc<ConnectionManager>, &'a str),
}

impl<'a> FileSystemBackend<'a> {
    fn from_tab_id(
        tab_id: &'a str,
        manager: &'a Arc<ConnectionManager>
    ) -> Self {
        if tab_id.starts_with("local-") {
            Self::Local
        } else {
            Self::Remote(manager, tab_id)
        }
    }

    async fn list_dir(&self, path: &str) -> Result<Vec<SftpEntry>>;
    async fn read_file(&self, path: &str) -> Result<Vec<u8>>;
    async fn write_file(&self, path: &str, content: &[u8]) -> Result<()>;
    async fn remove_file(&self, path: &str) -> Result<()>;
    async fn create_dir(&self, path: &str) -> Result<()>;
}
```

### 4. 批量操作请求/响应

```rust
// src-tauri/src/commands/sftp.rs

/// 批量文件操作结果
#[derive(serde::Serialize)]
pub struct BatchOperationResult {
    pub success_count: usize,
    pub failed_count: usize,
    pub errors: Vec<(String, String)>, // (file_path, error_message)
}
```

```typescript
// web/src/types/sftp.ts

interface BatchOperationResult {
  successCount: number;
  failedCount: number;
  errors: Array<{ path: string; error: string }>;
}
```

### 5. 前端状态模型

```typescript
// web/src/stores/ssh-store.ts

interface SshState {
  // 连接管理
  connections: Map<number, Connection>;
  
  // 输入缓冲（防抖）
  inputBuffers: Record<number, string>;
  inputTimers: Record<number, NodeJS.Timeout>;
  
  // 上传任务
  uploadTasks: UploadTask[];
  
  // Actions
  sendToTerminal: (serverId: number, data: string) => void;
  clearInputBuffer: (serverId: number) => void;
  addUploadTask: (task: UploadTask) => void;
  updateUploadProgress: (taskId: string, progress: number) => void;
}

interface UploadTask {
  id: string;
  serverId: number;
  filename: string;
  localPath: string;
  remotePath: string;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
}
```


## Correctness Properties

*属性（Property）是一个特征或行为，应该在系统的所有有效执行中保持为真——本质上是关于系统应该做什么的形式化陈述。属性作为人类可读规范和机器可验证正确性保证之间的桥梁。*

### 属性反思

在分析验收标准后，我识别出以下可测试的属性。经过反思，我发现了一些冗余：

**冗余分析**:
1. 需求 2.2（路径验证返回一致错误）和 2.3（validate_path 调用后行为一致）可以合并为一个综合属性
2. 需求 2.6（重构前后功能等价）实际上包含了 2.3，可以合并
3. 需求 8.4 和 10.2 都是关于解密失败的错误处理，可以合并为一个属性

**合并后的属性列表**:
- Property 1: 临时文件清理后不存在（需求 1.1）
- Property 2: 路径验证重构保持功能等价（需求 2.2, 2.3, 2.6 合并）
- Property 3: 密码强度验证正确性（需求 8.2）
- Property 4: 解密失败返回明确错误（需求 8.4, 10.2 合并）
- Property 5: 错误消息友好化转换（需求 9.2）

### Property 1: 临时文件清理完整性

*对于任意* 在临时文件列表中的文件路径（check_output.txt, output.txt, output_utf8.txt, test_output.log），执行清理操作后，该文件应该不存在于文件系统中。

**验证**: 需求 1.1

**测试策略**: 
- 创建测试临时文件
- 执行清理脚本
- 验证文件不存在

### Property 2: 路径验证重构功能等价性

*对于任意* SFTP 路径字符串和任意 SFTP 命令（list_dir, read_file, write_file, remove_file, create_dir, download, upload），重构前后对于相同输入应该产生相同的验证结果（通过或失败），并且失败时返回相同的错误消息。

**验证**: 需求 2.2, 2.3, 2.6

**测试策略**:
- 生成随机路径（包括安全路径和危险路径）
- 对每个 SFTP 命令调用重构前后的验证逻辑
- 验证结果一致性（Ok/Err 相同，错误消息相同）

**关键不变量**:
- 所有包含 `..` 的路径应该被拒绝
- 所有包含 `\0` 的路径应该被拒绝
- 所有安全路径应该被接受
- 错误消息应该是 `messages::PATH_TRAVERSAL`


### Property 3: 密码强度验证正确性

*对于任意* 密码字符串，密码强度验证函数应该根据以下规则返回正确的强度等级：
- 长度 < 8: weak
- 长度 >= 8 且包含 < 2 种字符类型: weak
- 长度 >= 8 且包含 2-3 种字符类型: medium
- 长度 >= 8 且包含 >= 4 种字符类型: strong
- 长度 >= 12 且包含 >= 4 种字符类型: strong

其中字符类型包括：大写字母、小写字母、数字、特殊字符。

**验证**: 需求 8.2

**测试策略**:
- 生成随机密码（不同长度、不同字符组合）
- 调用 `validatePasswordStrength()`
- 验证返回的强度等级符合规则

**边缘情况**:
- 空字符串 → weak
- 纯数字 → weak
- 长密码但单一字符类型 → medium
- 短密码但多种字符类型 → weak（长度优先）

### Property 4: 解密失败错误处理

*对于任意* 损坏的加密数据（无效的 base64、错误的密文、篡改的数据），解密操作应该返回 `SshError::Encryption` 错误，而不是返回 `None` 或静默失败。

**验证**: 需求 8.4, 10.2

**测试策略**:
- 生成有效的加密数据
- 篡改加密数据（修改字节、截断、添加垃圾数据）
- 调用 `decrypt()`
- 验证返回 `Err(SshError::Encryption(_))`

**关键不变量**:
- 解密失败必须返回错误，不能返回 None
- 错误消息应该包含 `messages::DECRYPTION_FAILED`
- 错误应该被记录到日志

### Property 5: 错误消息友好化转换

*对于任意* 技术错误字符串，`getFriendlyErrorMessage()` 函数应该：
- 如果错误包含已知模式（如 "Connection refused"），返回对应的友好消息
- 如果错误不包含已知模式，返回原始错误字符串
- 返回的消息应该是本地化的（通过 t() 函数）

**验证**: 需求 9.2

**测试策略**:
- 生成各种技术错误字符串
- 调用 `getFriendlyErrorMessage()`
- 验证返回的消息符合预期

**已知模式映射**:
- "Connection refused" → "无法连接到服务器，请检查地址和端口是否正确"
- "Connection timed out" → "连接超时，请检查网络连接和服务器状态"
- "Authentication failed" → "用户名或密码错误，请检查登录凭据"
- "Permission denied" → "权限不足，无法访问该资源"
- "File not found" → "文件或目录不存在"
- "Path traversal" → "路径包含非法字符，操作被拒绝"
- "decrypt" → "密码解密失败，可能已损坏，请重新输入"


## Error Handling

### 1. 错误类型层次

```rust
// src-tauri/src/error.rs

#[derive(Error, Debug)]
pub enum SshError {
    #[error("Connection failed: {0}")]
    ConnectionFailed(String),

    #[error("Authentication error: {0}")]
    AuthFailed(String),

    #[error("IO error")]
    Io(#[from] std::io::Error),

    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("Encryption error: {0}")]
    Encryption(String),

    #[error("Configuration error: {0}")]
    Config(String),

    #[error("Channel error: {0}")]
    Channel(String),
}
```

### 2. 错误处理策略

#### 2.1 后端错误处理

**原则**:
1. 使用 `Result<T>` 类型传播错误
2. 在边界处（Tauri 命令）捕获并转换错误
3. 记录所有错误到日志
4. 返回用户友好的错误消息

**示例**:
```rust
#[tauri::command]
pub async fn sftp_read_file(
    tab_id: String,
    path: String,
    state: State<'_, Arc<ConnectionManager>>
) -> Result<String> {
    // 验证输入
    validate_sftp_path(&path)
        .map_err(|e| {
            log::warn!("Path validation failed: {}", e);
            e
        })?;
    
    // 执行操作
    let backend = FileSystemBackend::from_tab_id(&tab_id, &state);
    let content = backend.read_file(&path)
        .await
        .map_err(|e| {
            log::error!("Failed to read file {}: {}", path, e);
            e
        })?;
    
    // 转换为字符串
    String::from_utf8(content)
        .map_err(|e| {
            log::error!("File {} is not valid UTF-8: {}", path, e);
            SshError::Io(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "File is not valid UTF-8"
            ))
        })
}
```

#### 2.2 前端错误处理

**原则**:
1. 捕获所有 IPC 调用的错误
2. 转换为用户友好的消息
3. 使用 toast 通知用户
4. 记录错误到控制台（开发模式）

**示例**:
```typescript
async function connectToServer(config: ServerConfig) {
  try {
    await invoke('ssh_connect', { config });
    toast.success(t('connection.success'));
  } catch (error) {
    const message = getFriendlyErrorMessage(String(error), t);
    toast.error(message);
    
    if (import.meta.env.DEV) {
      console.error('Connection failed:', error);
    }
  }
}
```

### 3. 错误恢复策略

#### 3.1 自动重连

**场景**: SSH 连接意外断开

**策略**:
- 最多重连 2 次
- 每次重连间隔 2 秒
- 重连失败后通知用户

```rust
// src-tauri/src/ssh/manager.rs

async fn connection_actor(...) {
    let mut reconnect_count = 0;
    
    loop {
        match handle_connection(&mut conn).await {
            Ok(_) => {
                reconnect_count = 0; // 重置计数
            }
            Err(e) if reconnect_count < MAX_RECONNECT_ATTEMPTS => {
                log::warn!("Connection lost, attempting reconnect {}/{}",
                    reconnect_count + 1, MAX_RECONNECT_ATTEMPTS);
                
                reconnect_count += 1;
                tokio::time::sleep(Duration::from_secs(2)).await;
                
                // 尝试重连
                if let Err(e) = conn.reconnect().await {
                    log::error!("Reconnect failed: {}", e);
                    continue;
                }
            }
            Err(e) => {
                log::error!("Connection failed after {} retries: {}", 
                    reconnect_count, e);
                
                // 通知前端
                let _ = app_handle.emit("ssh-disconnected", &id);
                break;
            }
        }
    }
}
```

#### 3.2 密码解密失败恢复

**场景**: 密码解密失败（密钥损坏或更换）

**策略**:
- 返回明确错误
- 前端提示用户重新输入密码
- 保留其他配置信息

```rust
// 后端
pub async fn get_server(&self, id: i64) -> Result<ServerConfig> {
    // ...
    let password = if let Some(enc) = row.get::<Option<String>, _>("password") {
        match self.crypto.decrypt(&enc) {
            Ok(p) => Some(p),
            Err(e) => {
                log::error!("Password decryption failed for server {}: {}", id, e);
                return Err(SshError::Encryption(messages::DECRYPTION_FAILED.into()));
            }
        }
    } else {
        None
    };
    // ...
}
```

```typescript
// 前端
async function loadServer(id: number) {
  try {
    return await invoke<ServerConfig>('get_server', { id });
  } catch (error) {
    if (String(error).includes('decrypt')) {
      // 打开编辑对话框，让用户重新输入密码
      const config = await invoke<ServerConfig>('get_server_without_password', { id });
      openServerEditDialog(config);
      throw new Error(t('errors.password_corrupted'));
    }
    throw error;
  }
}
```

### 4. 错误日志

**日志级别**:
- `ERROR`: 操作失败，需要用户干预
- `WARN`: 操作失败但可以恢复（如重连）
- `INFO`: 正常操作信息
- `DEBUG`: 调试信息

**示例**:
```rust
log::error!("Failed to connect to {}:{}: {}", host, port, e);
log::warn!("Connection lost, attempting reconnect");
log::info!("Successfully connected to {}", host);
log::debug!("Received {} bytes from channel", data.len());
```


## Testing Strategy

### 测试方法论

本项目采用**双重测试策略**，结合单元测试和属性测试，确保全面的测试覆盖：

- **单元测试**: 验证具体示例、边缘情况和错误条件
- **属性测试**: 验证跨所有输入的通用属性
- **集成测试**: 验证模块间交互和端到端流程

两者互补，单元测试捕获具体 bug，属性测试验证通用正确性。

### 1. 后端测试策略

#### 1.1 单元测试

**目标覆盖率**: 30%+ (核心模块 60%+)

**测试框架**: Rust 内置测试框架 + tokio::test

**测试组织**:
```rust
// src-tauri/src/security/validation.rs

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_safe_paths() {
        assert!(validate_sftp_path("file.txt").is_ok());
        assert!(validate_sftp_path("dir/file.txt").is_ok());
        assert!(validate_sftp_path("./file.txt").is_ok());
    }

    #[test]
    fn test_validate_dangerous_paths() {
        assert!(validate_sftp_path("../etc/passwd").is_err());
        assert!(validate_sftp_path("file\0.txt").is_err());
        assert!(validate_sftp_path("dir/../file").is_err());
    }

    #[test]
    fn test_error_message_consistency() {
        let err1 = validate_sftp_path("../etc/passwd").unwrap_err();
        let err2 = validate_sftp_path("file\0.txt").unwrap_err();
        
        // 验证错误消息一致
        assert_eq!(err1.to_string(), err2.to_string());
    }
}
```

**关键测试模块**:
1. `security/validation.rs` - 路径验证逻辑
2. `crypto/mod.rs` - 加密解密往返测试
3. `ssh/connection.rs` - 连接超时和重连逻辑
4. `commands/sftp.rs` - SFTP 命令集成测试

#### 1.2 属性测试

**测试框架**: proptest 或 quickcheck

**配置**: 每个属性测试最少 100 次迭代

**示例**:
```rust
// src-tauri/src/security/validation.rs

#[cfg(test)]
mod property_tests {
    use super::*;
    use proptest::prelude::*;

    proptest! {
        /// Feature: code-quality-refactoring, Property 2: 路径验证重构功能等价性
        /// 
        /// 对于任意路径字符串，重构前后的验证结果应该一致
        #[test]
        fn prop_path_validation_equivalence(path in "\\PC*") {
            let old_result = old_validate_path(&path);
            let new_result = validate_sftp_path(&path);
            
            // 验证结果类型一致（Ok/Err）
            assert_eq!(old_result.is_ok(), new_result.is_ok());
            
            // 如果都是错误，验证错误消息一致
            if let (Err(e1), Err(e2)) = (old_result, new_result) {
                assert_eq!(e1.to_string(), e2.to_string());
            }
        }

        /// Feature: code-quality-refactoring, Property 2: 危险路径必须被拒绝
        #[test]
        fn prop_dangerous_paths_rejected(
            prefix in "[a-z]{1,10}",
            suffix in "[a-z]{1,10}"
        ) {
            // 生成包含 .. 的路径
            let path = format!("{}/../{}", prefix, suffix);
            assert!(validate_sftp_path(&path).is_err());
            
            // 生成包含 \0 的路径
            let path_with_null = format!("{}\0{}", prefix, suffix);
            assert!(validate_sftp_path(&path_with_null).is_err());
        }
    }
}
```

```rust
// src-tauri/src/crypto/mod.rs

#[cfg(test)]
mod property_tests {
    use super::*;
    use proptest::prelude::*;

    proptest! {
        /// Feature: code-quality-refactoring, Property 4: 加密解密往返
        /// 
        /// 对于任意字符串，加密后解密应该得到原始字符串
        #[test]
        fn prop_encrypt_decrypt_roundtrip(plaintext in "\\PC{0,1000}") {
            let crypto = CryptoManager::new().unwrap();
            
            let encrypted = crypto.encrypt(&plaintext).unwrap();
            let decrypted = crypto.decrypt(&encrypted).unwrap();
            
            assert_eq!(plaintext, decrypted);
        }

        /// Feature: code-quality-refactoring, Property 4: 损坏数据解密失败
        /// 
        /// 对于任意损坏的加密数据，解密应该返回错误
        #[test]
        fn prop_corrupted_data_fails(
            valid_plaintext in "\\PC{1,100}",
            corruption_index in 0usize..100
        ) {
            let crypto = CryptoManager::new().unwrap();
            let encrypted = crypto.encrypt(&valid_plaintext).unwrap();
            
            // 损坏加密数据
            let mut corrupted = encrypted.into_bytes();
            if corruption_index < corrupted.len() {
                corrupted[corruption_index] ^= 0xFF; // 翻转字节
            }
            let corrupted_str = String::from_utf8_lossy(&corrupted).to_string();
            
            // 验证解密失败
            let result = crypto.decrypt(&corrupted_str);
            assert!(result.is_err());
            assert!(matches!(result.unwrap_err(), SshError::Encryption(_)));
        }
    }
}
```


### 2. 前端测试策略

#### 2.1 单元测试

**目标覆盖率**: 20%+ (工具函数 60%+)

**测试框架**: Vitest + React Testing Library

**测试组织**:
```typescript
// web/src/utils/passwordStrength.test.ts

import { describe, it, expect } from 'vitest';
import { validatePasswordStrength } from './passwordStrength';

describe('validatePasswordStrength', () => {
  it('should return weak for short passwords', () => {
    expect(validatePasswordStrength('abc')).toBe('weak');
    expect(validatePasswordStrength('1234567')).toBe('weak');
  });

  it('should return weak for long but simple passwords', () => {
    expect(validatePasswordStrength('aaaaaaaa')).toBe('weak');
    expect(validatePasswordStrength('12345678')).toBe('weak');
  });

  it('should return medium for passwords with 2-3 character types', () => {
    expect(validatePasswordStrength('abcd1234')).toBe('medium');
    expect(validatePasswordStrength('Abcd1234')).toBe('medium');
  });

  it('should return strong for complex passwords', () => {
    expect(validatePasswordStrength('Abcd1234!')).toBe('strong');
    expect(validatePasswordStrength('MyP@ssw0rd')).toBe('strong');
  });
});
```

```typescript
// web/src/utils/errorMessages.test.ts

import { describe, it, expect, vi } from 'vitest';
import { getFriendlyErrorMessage } from './errorMessages';

describe('getFriendlyErrorMessage', () => {
  const mockT = vi.fn((key, defaultValue) => defaultValue);

  it('should convert connection refused error', () => {
    const error = 'Connection refused (os error 111)';
    const result = getFriendlyErrorMessage(error, mockT);
    expect(result).toContain('无法连接到服务器');
  });

  it('should convert authentication failed error', () => {
    const error = 'Authentication failed: invalid credentials';
    const result = getFriendlyErrorMessage(error, mockT);
    expect(result).toContain('用户名或密码错误');
  });

  it('should return original error for unknown patterns', () => {
    const error = 'Unknown error occurred';
    const result = getFriendlyErrorMessage(error, mockT);
    expect(result).toBe(error);
  });
});
```

#### 2.2 组件测试

```typescript
// web/src/components/FileTree.test.tsx

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FileTree } from './FileTree';

describe('FileTree', () => {
  it('should show skeleton when loading', () => {
    const { container } = render(<FileTree isLoading={true} files={[]} />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('should render file list when loaded', () => {
    const files = [
      { name: 'file1.txt', type: 'file' },
      { name: 'dir1', type: 'directory' }
    ];
    render(<FileTree isLoading={false} files={files} />);
    
    expect(screen.getByText('file1.txt')).toBeInTheDocument();
    expect(screen.getByText('dir1')).toBeInTheDocument();
  });
});
```

#### 2.3 属性测试（TypeScript）

**测试框架**: fast-check

```typescript
// web/src/utils/passwordStrength.property.test.ts

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { validatePasswordStrength } from './passwordStrength';

describe('passwordStrength properties', () => {
  /**
   * Feature: code-quality-refactoring, Property 3: 密码强度验证正确性
   * 
   * 对于任意短密码（< 8 字符），应该返回 weak
   */
  it('should always return weak for short passwords', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 7 }),
        (password) => {
          expect(validatePasswordStrength(password)).toBe('weak');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: code-quality-refactoring, Property 3: 密码强度验证正确性
   * 
   * 对于任意包含所有字符类型的长密码，应该返回 strong
   */
  it('should return strong for complex long passwords', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.stringOf(fc.char().filter(c => /[A-Z]/.test(c)), { minLength: 1 }),
          fc.stringOf(fc.char().filter(c => /[a-z]/.test(c)), { minLength: 1 }),
          fc.stringOf(fc.char().filter(c => /[0-9]/.test(c)), { minLength: 1 }),
          fc.stringOf(fc.char().filter(c => /[^A-Za-z0-9]/.test(c)), { minLength: 1 }),
          fc.string({ minLength: 4 })
        ),
        ([upper, lower, digit, special, extra]) => {
          const password = upper + lower + digit + special + extra;
          if (password.length >= 8) {
            expect(validatePasswordStrength(password)).toBe('strong');
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

### 3. 集成测试

#### 3.1 端到端测试场景

**测试工具**: Playwright (可选)

**关键场景**:
1. 服务器连接流程
2. 文件上传下载
3. 终端交互
4. 错误恢复

**示例**:
```typescript
// tests/e2e/connection.spec.ts

import { test, expect } from '@playwright/test';

test('should connect to server and list files', async ({ page }) => {
  await page.goto('/');
  
  // 添加服务器
  await page.click('[data-testid="add-server"]');
  await page.fill('[name="host"]', 'localhost');
  await page.fill('[name="port"]', '22');
  await page.fill('[name="username"]', 'testuser');
  await page.fill('[name="password"]', 'testpass');
  await page.click('[data-testid="save-server"]');
  
  // 连接
  await page.click('[data-testid="connect-server"]');
  await expect(page.locator('[data-testid="terminal"]')).toBeVisible();
  
  // 切换到文件浏览器
  await page.click('[data-testid="files-tab"]');
  await expect(page.locator('[data-testid="file-tree"]')).toBeVisible();
});
```

### 4. 测试执行

#### 4.1 运行测试

```bash
# 后端测试
cd src-tauri
cargo test                          # 运行所有测试
cargo test --test integration       # 运行集成测试
cargo test -- --nocapture          # 显示输出

# 前端测试
cd web
pnpm test                          # 运行所有测试
pnpm test:watch                    # 监听模式
pnpm test:coverage                 # 生成覆盖率报告

# E2E 测试
pnpm test:e2e
```

#### 4.2 持续集成

**GitHub Actions 配置**:
```yaml
name: Tests

on: [push, pull_request]

jobs:
  test-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions-rs/toolchain@v1
        with:
          toolchain: stable
      - name: Run tests
        run: cd src-tauri && cargo test
      - name: Check coverage
        run: cargo tarpaulin --out Xml

  test-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - name: Install dependencies
        run: pnpm install
      - name: Run tests
        run: cd web && pnpm test:coverage
```

### 5. 测试覆盖率目标

| 模块 | 当前覆盖率 | 目标覆盖率 |
|------|-----------|-----------|
| security/validation | 100% (8 tests) | 100% |
| crypto | 0% | 60%+ |
| ssh/connection | 0% | 40%+ |
| ssh/manager | 0% | 30%+ |
| commands/sftp | 0% | 50%+ |
| 前端工具函数 | 0% | 60%+ |
| 前端组件 | 0% | 30%+ |
| **整体后端** | <10% | **30%+** |
| **整体前端** | <5% | **20%+** |


## Implementation Plan

### 阶段划分

整改工作分为 4 个阶段，每个阶段独立可测试，渐进式推进：

#### 阶段 1: 清理和准备（1-2 天）

**目标**: 清理临时文件，建立清晰的项目结构

**任务**:
1. 删除临时文件（*.txt, *.log）
2. 更新 .gitignore
3. 整理草稿文档到 docs/
4. 删除无用配置文件
5. 运行 pnpm lint --fix 清理未使用导入

**验证**:
- `git status` 不显示临时文件
- 所有文档在 docs/ 目录下
- lint 无警告

**风险**: 低 - 不涉及代码逻辑修改

#### 阶段 2: 代码重构（3-5 天）

**目标**: 消除代码重复，优化模块结构

**任务**:
1. 创建 `security/validation.rs` 统一路径验证
2. 创建 `commands/` 模块并拆分 commands.rs
3. 实现 `FileSystemBackend` 抽象
4. 提取前端 `useTerminalFit` Hook
5. 添加错误消息常量
6. 常量化所有魔法数字

**验证**:
- 所有现有测试通过（8 个路径验证测试）
- 新增单元测试覆盖重构代码
- 前后端编译无错误
- 功能手动测试通过

**风险**: 中 - 涉及核心逻辑重构，需要仔细测试

**回滚策略**: 使用 git 分支，每个子任务独立提交

#### 阶段 3: 测试和文档（2-3 天）

**目标**: 添加核心测试，完善文档

**任务**:
1. 添加 crypto 加密解密测试
2. 添加 ssh/connection 超时和重连测试
3. 添加 commands/sftp 集成测试
4. 添加前端工具函数测试
5. 添加前端组件测试
6. 编写 architecture.md
7. 编写 data-flow.md
8. 编写 security-model.md
9. 完善 API.md

**验证**:
- 测试覆盖率达到目标（后端 30%+，前端 20%+）
- 所有测试通过
- 文档完整且准确

**风险**: 低 - 不影响现有功能

#### 阶段 4: 优化和增强（3-4 天）

**目标**: 性能优化，安全增强，用户体验改进

**任务**:
1. 添加数据库索引
2. 实现批量 SFTP 操作
3. 优化前端性能（useMemo, React.memo）
4. 配置 CSP
5. 实现密码强度验证
6. 实现空闲超时机制
7. 改进错误处理（解密失败、友好错误消息）
8. 添加加载骨架屏
9. 修复输入缓冲区竞态条件

**验证**:
- 性能测试（启动时间、内存占用、响应延迟）
- 安全测试（CSP、密码强度、超时）
- 用户体验测试（错误提示、加载状态）

**风险**: 中 - 涉及新功能添加，需要充分测试

### 实施顺序

```
Week 1:
  Day 1-2: 阶段 1 (清理和准备)
  Day 3-5: 阶段 2 开始 (路径验证统一 + commands 拆分)

Week 2:
  Day 1-2: 阶段 2 完成 (FileSystemBackend + 前端重构)
  Day 3-5: 阶段 3 (测试和文档)

Week 3:
  Day 1-4: 阶段 4 (优化和增强)
  Day 5: 最终测试和发布准备
```

### 关键里程碑

1. **M1: 清理完成** (Day 2)
   - 所有临时文件删除
   - 文档结构清晰
   - lint 无警告

2. **M2: 重构完成** (Day 7)
   - commands 模块化完成
   - 代码重复消除
   - 所有测试通过

3. **M3: 测试覆盖达标** (Day 10)
   - 后端覆盖率 30%+
   - 前端覆盖率 20%+
   - 文档完善

4. **M4: 整改完成** (Day 15)
   - 所有需求实现
   - 性能达标
   - 准备发布

### 风险管理

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| 重构破坏现有功能 | 中 | 高 | 充分测试，使用 git 分支，每个子任务独立提交 |
| 测试覆盖率不达标 | 低 | 中 | 优先测试核心模块，使用属性测试提高覆盖 |
| 性能优化效果不明显 | 中 | 低 | 先进行性能基准测试，针对性优化 |
| 时间超期 | 中 | 中 | 优先完成核心需求，次要需求可延后 |

### 回滚计划

每个阶段完成后打 tag，如果出现严重问题可以回滚到上一个稳定版本：

```bash
# 阶段 1 完成
git tag -a v0.3.8-cleanup -m "Phase 1: Cleanup completed"

# 阶段 2 完成
git tag -a v0.3.8-refactor -m "Phase 2: Refactoring completed"

# 阶段 3 完成
git tag -a v0.3.8-testing -m "Phase 3: Testing completed"

# 阶段 4 完成
git tag -a v0.3.8 -m "Code quality refactoring completed"
```


## Summary

### 设计概述

本技术设计文档详细说明了 HeTaoSSH 代码质量整改的完整方案，涵盖了从文件清理到性能优化的所有方面。设计遵循以下核心原则：

1. **向后兼容**: 所有重构保持功能等价，不破坏现有 API
2. **渐进式**: 分阶段实施，每个阶段独立可测试
3. **可测试性**: 双重测试策略（单元测试 + 属性测试）
4. **可维护性**: 模块化设计，清晰的职责划分
5. **轻量级**: 不引入重型依赖，保持应用特性

### 关键设计决策

#### 1. 模块化架构

**决策**: 将 600+ 行的 commands.rs 拆分为 4 个子模块

**理由**:
- 提高代码可读性和可维护性
- 便于单元测试
- 降低模块间耦合

**权衡**: 增加文件数量，但提高了代码组织性

#### 2. 文件系统后端抽象

**决策**: 使用枚举抽象本地/远程文件系统

**理由**:
- 消除重复的 if-else 判断
- 统一接口，易于扩展
- 更好的类型安全

**权衡**: 增加一层抽象，但提高了代码复用性

#### 3. 错误消息常量化

**决策**: 将所有错误消息定义为常量

**理由**:
- 便于国际化
- 确保错误消息一致性
- 易于维护和更新

**权衡**: 需要额外的常量定义，但提高了可维护性

#### 4. 双重测试策略

**决策**: 结合单元测试和属性测试

**理由**:
- 单元测试验证具体场景
- 属性测试验证通用正确性
- 两者互补，提供全面覆盖

**权衡**: 增加测试编写工作量，但显著提高代码质量

### 预期成果

#### 代码质量指标

| 指标 | 当前 | 目标 | 改进 |
|------|------|------|------|
| 代码重复率 | ~5% | <2% | -60% |
| 测试覆盖率（后端） | <10% | 30%+ | +200% |
| 测试覆盖率（前端） | <5% | 20%+ | +300% |
| 平均文件行数 | 300+ | <250 | -17% |
| 文档完整性 | 60% | 90%+ | +50% |
| Lint 警告数 | 10+ | 0 | -100% |

#### 性能指标

| 指标 | 当前 | 目标 | 改进 |
|------|------|------|------|
| 冷启动时间 | ~1.5s | <1.5s | 保持 |
| 内存占用 | ~80MB | <80MB | 保持 |
| 数据库查询时间 | ~50ms | <30ms | -40% |
| 批量文件操作 | N/A | 支持 | 新增 |

#### 安全性改进

- ✅ CSP 配置
- ✅ 密码强度验证
- ✅ 空闲超时机制
- ✅ 改进的错误处理（解密失败）

#### 用户体验改进

- ✅ 友好的错误提示
- ✅ 加载骨架屏
- ✅ 操作进度反馈
- ✅ 修复竞态条件 bug

### 后续工作

本次整改完成后，建议继续以下工作：

1. **持续测试**: 将测试覆盖率提升到 60%+
2. **性能监控**: 建立性能监控体系，持续优化
3. **国际化**: 完善所有错误消息的翻译
4. **E2E 测试**: 添加端到端测试，覆盖关键用户流程
5. **代码审查**: 建立代码审查流程，保持代码质量

### 结论

本设计文档提供了一个全面、可执行的代码质量整改方案。通过系统性的重构、测试和优化，HeTaoSSH 项目将从当前的 4/5 评分提升到 4.5/5，同时保持轻量级和高性能的特性。

设计遵循最佳实践，采用渐进式实施策略，确保整改过程平稳可控。所有改进都经过充分考虑，权衡了复杂度和收益，确保最终交付一个高质量、易维护、可扩展的代码库。

---

**设计完成日期**: 2026-03-17  
**预计实施周期**: 3 周  
**设计版本**: 1.0

