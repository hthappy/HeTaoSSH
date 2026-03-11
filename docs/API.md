# HetaoSSH API 文档

## 概述

HetaoSSH 使用 Tauri 的 IPC 机制进行前后端通信。本文档列出所有可用的 Tauri 命令和数据结构。

## 调用方式

前端使用 `@tauri-apps/api/core` 的 `invoke` 函数调用后端命令：

```typescript
import { invoke } from '@tauri-apps/api/core';

// 调用示例
const result = await invoke<string>('command_name', { arg1: 'value' });
```

## 命令列表

### 服务器管理

#### `list_servers`

获取所有已保存的服务器列表。

**参数:** 无

**返回:** `Promise<ServerConfig[]>`

**示例:**
```typescript
const servers = await invoke<ServerConfig[]>('list_servers');
```

---

#### `save_server`

保存或更新服务器配置。

**参数:**
- `config: ServerConfig` - 服务器配置对象

**返回:** `Promise<i64>` - 服务器 ID

**示例:**
```typescript
const id = await invoke<i64>('save_server', {
  config: {
    name: 'My Server',
    host: '192.168.1.100',
    port: 22,
    username: 'root',
    password: 'secret',
  }
});
```

---

#### `delete_server`

删除服务器。

**参数:**
- `id: i64` - 服务器 ID

**返回:** `Promise<void>`

**示例:**
```typescript
await invoke('delete_server', { id: 1 });
```

---

#### `test_connection`

测试服务器连接（不保存）。

**参数:**
- `config: ServerConfig` - 服务器配置

**返回:** `Promise<string>` - 连接结果消息

**示例:**
```typescript
const result = await invoke<string>('test_connection', {
  config: { /* ... */ }
});
```

---

### SFTP 文件操作

#### `sftp_list_dir`

列出远程目录内容。

**参数:**
- `path: string` - 远程目录路径

**返回:** `Promise<SftpEntry[]>`

**示例:**
```typescript
const entries = await invoke<SftpEntry[]>('sftp_list_dir', {
  path: '/home/user'
});
```

---

#### `sftp_read_file`

读取远程文件内容。

**参数:**
- `path: string` - 远程文件路径

**返回:** `Promise<string>` - 文件内容

**示例:**
```typescript
const content = await invoke<string>('sftp_read_file', {
  path: '/home/user/config.txt'
});
```

---

#### `sftp_write_file`

写入远程文件。

**参数:**
- `path: string` - 远程文件路径
- `content: string` - 文件内容

**返回:** `Promise<void>`

**示例:**
```typescript
await invoke('sftp_write_file', {
  path: '/home/user/config.txt',
  content: 'new content'
});
```

---

#### `sftp_remove_file`

删除远程文件。

**参数:**
- `path: string` - 远程文件路径

**返回:** `Promise<void>`

**示例:**
```typescript
await invoke('sftp_remove_file', {
  path: '/home/user/old_file.txt'
});
```

---

#### `sftp_create_dir`

创建远程目录。

**参数:**
- `path: string` - 远程目录路径

**返回:** `Promise<void>`

**示例:**
```typescript
await invoke('sftp_create_dir', {
  path: '/home/user/new_folder'
});
```

---

### 系统监控

#### `get_system_usage`

获取系统资源使用情况。

**参数:** 无

**返回:** `Promise<SystemUsage>`

**示例:**
```typescript
const usage = await invoke<SystemUsage>('get_system_usage');
```

---

### 命令片段

#### `list_snippets`

获取所有命令片段。

**参数:** 无

**返回:** `Promise<CommandSnippet[]>`

**示例:**
```typescript
const snippets = await invoke<CommandSnippet[]>('list_snippets');
```

---

#### `list_snippet_categories`

获取所有命令分类。

**参数:** 无

**返回:** `Promise<string[]>`

**示例:**
```typescript
const categories = await invoke<string[]>('list_snippet_categories');
```

---

#### `save_snippet`

保存或更新命令片段。

**参数:**
- `snippet: CommandSnippet` - 片段对象

**返回:** `Promise<i64>` - 片段 ID

**示例:**
```typescript
const id = await invoke<i64>('save_snippet', {
  snippet: {
    name: 'Check Disk',
    command: 'df -h',
    description: 'Show disk usage',
    category: 'System'
  }
});
```

---

#### `delete_snippet`

删除命令片段。

**参数:**
- `id: i64` - 片段 ID

**返回:** `Promise<void>`

**示例:**
```typescript
await invoke('delete_snippet', { id: 1 });
```

---

## 数据结构

### `ServerConfig`

服务器配置对象。

```typescript
interface ServerConfig {
  id?: number;              // 服务器 ID（可选，由数据库生成）
  name: string;             // 服务器名称
  host: string;             // 主机地址
  port: number;             // SSH 端口
  username: string;         // 用户名
  password?: string;        // 密码（加密存储）
  private_key_path?: string; // 私钥路径
  passphrase?: string;      // 私钥密码（加密存储）
}
```

---

### `SftpEntry`

SFTP 文件或目录条目。

```typescript
interface SftpEntry {
  filename: string;     // 文件名
  longname: string;     // 长格式名称
  is_dir: boolean;      // 是否为目录
  is_file: boolean;     // 是否为文件
  size: number;         // 文件大小（字节）
}
```

---

### `SystemUsage`

系统资源使用情况。

```typescript
interface SystemUsage {
  cpu_usage: number;        // CPU 使用率 (0-100)
  memory_usage: number;     // 内存使用率 (0-100)
  memory_total: number;     // 总内存（字节）
  memory_used: number;      // 已用内存（字节）
  memory_available: number; // 可用内存（字节）
  network_rx: number;       // 网络接收（字节）
  network_tx: number;       // 网络发送（字节）
  disk_usage: DiskUsage[];  // 磁盘使用情况
}

interface DiskUsage {
  mount_point: string;  // 挂载点
  total: number;        // 总空间（字节）
  used: number;         // 已用空间（字节）
  available: number;    // 可用空间（字节）
  usage_percent: number; // 使用率 (0-100)
}
```

---

### `CommandSnippet`

命令片段对象。

```typescript
interface CommandSnippet {
  id?: number;          // 片段 ID
  name: string;         // 名称
  command: string;      // 命令内容
  description?: string; // 描述
  category?: string;    // 分类
}
```

---

## 错误处理

所有命令都可能抛出错误。使用 try-catch 处理：

```typescript
try {
  const result = await invoke('some_command', { /* ... */ });
} catch (error) {
  console.error('Command failed:', error);
  // 显示错误提示给用户
}
```

常见错误类型：

- **ConnectionFailed**: SSH 连接失败
- **Io**: IO 错误
- **Config**: 配置错误
- **Encryption**: 加密/解密错误
- **Channel**: SSH 通道错误

---

## 后端实现

### 命令位置

所有 Tauri 命令定义在 `src-tauri/src/commands.rs`：

```rust
#[tauri::command]
pub fn command_name(arg: Type) -> Result<ReturnType> {
    // 实现
}
```

### 注册命令

在 `src-tauri/src/main.rs` 中注册：

```rust
.invoke_handler(tauri::generate_handler![
    command_name,
    // ... 其他命令
])
```

---

## 版本

- **API 版本**: 1.0
- **最后更新**: 2026-03-10
- **兼容版本**: HetaoSSH v0.1.0+
