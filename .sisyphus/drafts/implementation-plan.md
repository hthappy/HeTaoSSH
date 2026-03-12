# HetaoSSH 安全与性能改进实施计划

**创建日期**: 2026-03-11  
**项目**: HetaoSSH v0.1.0  
**预计总工时**: 8-10 小时  
**优先级**: 安全修复 > 性能优化 > 代码质量

---

## 📋 实施总览

| 阶段 | 任务 | 优先级 | 预计工时 | 状态 |
|------|------|--------|----------|------|
| 1 | 路径遍历防护 | 🔴 P0 | 2h | ⏳ Pending |
| 2 | Cargo Audit 集成 | 🟡 P1 | 0.5h | ⏳ Pending |
| 3 | IPC 防抖实现 | 🟡 P1 | 1h | ⏳ Pending |
| 4 | 性能基准测试 | 🟡 P1 | 2h | ⏳ Pending |
| 5 | ServerConfig Zeroize | 🟢 P2 | 1h | ⏳ Pending |
| 6 | 批量数据库操作 | 🟢 P2 | 1.5h | ⏳ Pending |
| 7 | CSP 配置（可选） | 🟢 P3 | 0.5h | ⏳ Pending |
| 8 | 文档更新 | 🟢 P3 | 0.5h | ⏳ Pending |

---

## 阶段 1: 路径遍历防护 (🔴 P0 - 安全关键)

### 问题描述

当前 SFTP 命令接受原始文件路径，攻击者可通过 `../` 序列访问任意文件系统路径。

**受影响命令**:
- `sftp_read_file()`
- `sftp_write_file()`
- `sftp_list_dir()`

### 实施方案

#### 步骤 1.1: 创建路径验证工具模块

**文件**: `src-tauri/src/security/path_validation.rs` (新建)

```rust
//! 路径安全验证模块
//! 防止目录遍历攻击

use crate::error::{Result, SshError};
use std::path::{Component, Path, PathBuf};

/// 验证并规范化文件路径
/// 
/// # Arguments
/// * `base_dir` - 允许的根目录（远程服务器的起始目录）
/// * `requested_path` - 用户请求的路径
/// 
/// # Returns
/// * `Ok(PathBuf)` - 规范化后的绝对路径
/// * `Err(SshError)` - 路径验证失败
pub fn validate_and_normalize_path(base_dir: &Path, requested_path: &str) -> Result<PathBuf> {
    // 1. 构建初始路径
    let target_path = if requested_path.is_empty() {
        base_dir.to_path_buf()
    } else {
        base_dir.join(requested_path)
    };
    
    // 2. 规范化路径（移除 . 和 ..）
    let mut normalized = PathBuf::new();
    for component in target_path.components() {
        match component {
            // 跳过所有父目录引用，防止遍历
            Component::ParentDir => {
                return Err(SshError::Config(
                    "Path traversal detected: parent directory access is not allowed".into()
                ));
            }
            // 跳过当前目录引用
            Component::CurDir => continue,
            // 保留正常组件
            Component::Normal(_) | Component::RootDir | Component::Prefix(_) => {
                normalized.push(component);
            }
        }
    }
    
    // 3. 验证规范化后的路径仍在 base_dir 内
    // 注意：canonicalize 要求路径存在，SFTP 场景可能不适用
    // 使用字符串前缀检查作为替代
    let normalized_str = normalized.to_string_lossy();
    let base_str = base_dir.to_string_lossy();
    
    if !normalized_str.starts_with(&base_str) {
        return Err(SshError::Config(
            "Path validation failed: resolved path is outside allowed directory".into()
        ));
    }
    
    Ok(normalized)
}

/// 简化版：仅检查路径是否包含危险模式
pub fn contains_traversal_pattern(path: &str) -> bool {
    path.contains("..") || path.contains('\0')
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_valid_paths() {
        let base = Path::new("/remote/root");
        
        assert!(validate_and_normalize_path(base, "file.txt").is_ok());
        assert!(validate_and_normalize_path(base, "dir/file.txt").is_ok());
        assert!(validate_and_normalize_path(base, "").is_ok());
        assert!(validate_and_normalize_path(base, "./file.txt").is_ok());
    }
    
    #[test]
    fn test_traversal_attempts() {
        let base = Path::new("/remote/root");
        
        // 这些应该被拒绝
        assert!(validate_and_normalize_path(base, "../etc/passwd").is_err());
        assert!(validate_and_normalize_path(base, "dir/../../etc/passwd").is_err());
        assert!(validate_and_normalize_path(base, "..").is_err());
    }
}
```

#### 步骤 1.2: 集成到 SFTP 命令

**文件**: `src-tauri/src/commands.rs` (修改)

```rust
// 在文件顶部添加导入
use crate::security::path_validation::validate_and_normalize_path;

// 修改 sftp_read_file
#[tauri::command]
pub async fn sftp_read_file(
    tab_id: String,
    path: String,
    state: State<'_, Arc<ConnectionManager>>
) -> Result<String> {
    // 获取连接的根目录（从 connection manager 获取）
    let base_dir = state.get_connection_base_dir(&tab_id)
        .await
        .unwrap_or_else(|_| PathBuf::from("/"));
    
    // 验证并规范化路径
    let safe_path = validate_and_normalize_path(&base_dir, &path)?;
    
    // 使用安全路径读取
    let content = state.sftp_read_file(&tab_id, &safe_path.to_string_lossy()).await?;
    String::from_utf8(content)
        .map_err(|e| crate::error::SshError::Channel(format!("Invalid UTF-8: {}", e)))
}

// 同样修改 sftp_write_file 和 sftp_list_dir
```

#### 步骤 1.3: 更新模块导出

**文件**: `src-tauri/src/lib.rs` (修改)

```rust
pub mod commands;
pub mod error;
pub mod ssh;
pub mod config;
pub mod crypto;
pub mod monitor;
pub mod snippets;
pub mod security; // 新增

// 或作为子模块
// pub mod security {
//     pub mod path_validation;
// }
```

**文件**: `src-tauri/src/security/mod.rs` (新建)

```rust
pub mod path_validation;

pub use path_validation::validate_and_normalize_path;
```

### 验证方法

```bash
# 运行新增的单元测试
cargo test path_validation -- --exact --nocapture

# 集成测试：尝试遍历路径
# 在 frontend 中测试：
await invoke('sftp_read_file', { tabId: 'conn-1', path: '../../../etc/passwd' })
// 应该返回错误，而不是文件内容
```

### 验收标准

- [ ] 所有包含 `..` 的路径被拒绝
- [ ] 正常路径仍然可用
- [ ] 单元测试通过
- [ ] 集成测试通过

---

## 阶段 2: Cargo Audit 集成 (🟡 P1)

### 实施方案

#### 步骤 2.1: 安装并运行

```bash
# 安装 cargo-audit
cargo install cargo-audit

# 运行审计
cd src-tauri
cargo audit
```

#### 步骤 2.2: 修复发现的漏洞

根据审计结果：
- 更新有漏洞的依赖版本
- 替换不安全的 crate
- 添加补丁或 workaround

#### 步骤 2.3: 添加到 CI/CD

**文件**: `.github/workflows/ci.yml` (新建或修改)

```yaml
name: CI

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  security-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable
      
      - name: Install cargo-audit
        run: cargo install cargo-audit
      
      - name: Run security audit
        run: cd src-tauri && cargo audit
      
      - name: Fail on vulnerabilities
        run: |
          cd src-tauri
          if cargo audit 2>&1 | grep -q "vulnerabilities found"; then
            echo "Security vulnerabilities detected!"
            exit 1
          fi
```

### 验收标准

- [ ] `cargo audit` 无 Critical/High 级别漏洞
- [ ] CI workflow 配置完成
- [ ] 漏洞扫描自动化运行

---

## 阶段 3: IPC 防抖实现 (🟡 P1)

### 问题描述

前端可高频调用 `ssh_send`，导致：
- SSH 频道过载
- 网络带宽浪费
- 后端处理队列堆积

### 实施方案

#### 步骤 3.1: 前端 Store 添加防抖

**文件**: `web/src/stores/ssh-store.ts` (修改)

```typescript
import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import type { ServerConfig } from '@/types/config'
import { useCallback, useRef } from 'react'
import { debounce } from 'lodash-es' // 需要安装：pnpm add lodash-es

// ... 其他 imports

// 在 store 外部创建防抖函数（避免每次重新创建）
const sendToTerminalDebounced = debounce(
  async (serverId: number, data: string) => {
    try {
      await invoke('ssh_send', { tabId: `conn-${serverId}`, data })
    } catch (err) {
      console.error('Failed to send data:', err)
    }
  },
  50, // 50ms 防抖窗口
  { 
    leading: false,
    trailing: true,
    maxWait: 100 // 最多等待 100ms
  }
)

export const useSshStore = create<SshState>((set, get) => ({
  // ... existing state
  
  sendToTerminal: async (serverId: number, data: string) => {
    // 使用防抖版本
    sendToTerminalDebounced(serverId, data)
  },
  
  // ... rest of store
}))

// 组件卸载时取消待处理的调用
export function useCleanupTerminalDebounce() {
  useEffect(() => {
    return () => {
      sendToTerminalDebounced.cancel()
    }
  }, [])
}
```

#### 步骤 3.2: 替代方案（无 lodash 依赖）

如果不想添加 lodash 依赖，手动实现防抖：

```typescript
// web/src/lib/debounce.ts (新建)

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  options: { leading?: boolean; trailing?: boolean; maxWait?: number } = {}
): T {
  let timeout: ReturnType<typeof setTimeout> | null = null
  let lastCallTime: number | null = null
  let lastInvokeTime: number = 0

  return function debounced(this: any, ...args: Parameters<T>) {
    const currentTime = Date.now()
    
    if (lastCallTime) {
      const elapsed = currentTime - lastCallTime
      const remaining = wait - elapsed
      
      if (remaining <= 0) {
        if (timeout) {
          clearTimeout(timeout)
          timeout = null
        }
        lastInvokeTime = currentTime
        func.apply(this, args)
      } else if (!timeout && options.trailing !== false) {
        timeout = setTimeout(() => {
          lastInvokeTime = Date.now()
          timeout = null
          func.apply(this, args)
        }, remaining)
      }
    } else {
      if (options.leading !== false) {
        lastInvokeTime = currentTime
        func.apply(this, args)
      }
    }
    
    lastCallTime = currentTime
  } as T
}

// 使用示例
const debouncedSend = debounce(
  (serverId: number, data: string) => invoke('ssh_send', { tabId: `conn-${serverId}`, data }),
  50
)
```

### 验收标准

- [ ] 快速输入时，实际调用次数明显减少
- [ ] 终端响应无明显延迟
- [ ] 内存无泄漏（防抖函数正确清理）

---

## 阶段 4: 性能基准测试 (🟡 P1)

### 实施方案

#### 步骤 4.1: 添加性能测量工具

**文件**: `src-tauri/src/main.rs` (修改)

```rust
use std::time::Instant;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let startup_start = Instant::now();
    
    tauri::Builder::default()
        .setup(|app| {
            let setup_time = startup_start.elapsed();
            log::info!("App setup completed in {}ms", setup_time.as_millis());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // ... commands
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

#### 步骤 4.2: 创建性能测试脚本

**文件**: `scripts/benchmark.sh` (新建 - Unix)

```bash
#!/bin/bash
# HetaoSSH 性能基准测试

echo "=== HetaoSSH Performance Benchmark ==="
echo ""

# 1. 冷启动测试
echo "1. Cold Start Test"
START=$(date +%s%N)
pnpm tauri dev &
PID=$!
sleep 5  # 等待 UI 就绪
END=$(date +%s%N)
ELAPSED=$(( (END - START) / 1000000 ))
echo "   Cold start time: ${ELAPSED}ms"
kill $PID 2>/dev/null
echo ""

# 2. 内存测试（需要手动测量）
echo "2. Memory Measurement"
echo "   Please monitor with Activity Monitor (macOS) or Task Manager (Windows)"
echo ""

# 3. 输入延迟测试
echo "3. Input Latency Test"
echo "   Manual test: Type in terminal and observe responsiveness"
echo ""

echo "=== Benchmark Complete ==="
```

**文件**: `scripts/benchmark.ps1` (新建 - Windows PowerShell)

```powershell
# HetaoSSH 性能基准测试

Write-Host "=== HetaoSSH Performance Benchmark ===" -ForegroundColor Cyan
Write-Host ""

# 1. 冷启动测试
Write-Host "1. Cold Start Test"
$StartTime = Get-Date
Start-Process "pnpm" -ArgumentList "tauri", "dev" -WindowStyle Hidden
Start-Sleep -Seconds 5
$EndTime = Get-Date
$Elapsed = ($EndTime - $StartTime).TotalMilliseconds
Write-Host "   Cold start time: ${Elapsed}ms"
Write-Host ""

# 2. 内存测试
Write-Host "2. Memory Measurement"
Write-Host "   Please monitor with Task Manager"
Write-Host ""

Write-Host "=== Benchmark Complete ===" -ForegroundColor Cyan
```

#### 步骤 4.3: 添加性能监控命令

**文件**: `src-tauri/src/commands.rs` (修改)

```rust
#[tauri::command]
pub fn get_performance_metrics() -> PerformanceMetrics {
    PerformanceMetrics {
        uptime_secs: std::process::id(), // 示例
        // 添加更多指标
    }
}

#[derive(serde::Serialize)]
pub struct PerformanceMetrics {
    pub uptime_secs: u32,
    // pub memory_usage_mb: f64,
    // pub active_connections: usize,
}
```

### 验收标准

- [ ] 冷启动时间记录到日志
- [ ] 基准测试脚本可运行
- [ ] 性能数据可导出

---

## 阶段 5: ServerConfig Zeroize (🟢 P2)

### 实施方案

#### 步骤 5.1: 添加 Zeroize 依赖

**文件**: `src-tauri/Cargo.toml` (已存在，确认版本)

```toml
[dependencies]
zeroize = { version = "1", features = ["derive"] }  # 确保有 derive 特性
```

#### 步骤 5.2: 实现 Zeroize for ServerConfig

**文件**: `src-tauri/src/config/mod.rs` (修改)

```rust
use zeroize::{Zeroize, ZeroizeOnDrop};

#[derive(Debug, Clone, Serialize, Deserialize, FromRef, Zeroize, ZeroizeOnDrop)]
pub struct ServerConfig {
    pub id: Option<i64>,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    
    #[zeroize(drop)]  // 显式标记需要清理的字段
    pub password: Option<String>,
    
    pub private_key_path: Option<String>,  // 仅路径，不需要清理
    
    #[zeroize(drop)]
    pub passphrase: Option<String>,
}

// 或者手动实现 Drop
impl Drop for ServerConfig {
    fn drop(&mut self) {
        if let Some(ref mut pwd) = self.password {
            pwd.zeroize();
        }
        if let Some(ref mut phrase) = self.passphrase {
            phrase.zeroize();
        }
    }
}
```

### 验收标准

- [ ] `ServerConfig` 实例销毁时密码被清理
- [ ] 编译无警告
- [ ] 现有功能正常

---

## 阶段 6: 批量数据库操作 (🟢 P2)

### 实施方案

#### 步骤 6.1: 添加批量保存方法

**文件**: `src-tauri/src/config/mod.rs` (修改)

```rust
impl ConfigManager {
    // ... existing methods
    
    /// 批量保存服务器配置（事务操作）
    pub async fn save_servers_batch(&self, configs: &[ServerConfig]) -> Result<()> {
        let mut tx = self.pool.begin().await?;
        
        for config in configs {
            let password_encrypted = config.password.as_ref().map(|p| {
                self.crypto.encrypt(p).map_err(|e| {
                    SshError::Config(format!("Encryption failed: {}", e))
                })
            }).transpose()?;
            
            let passphrase_encrypted = config.passphrase.as_ref().map(|p| {
                self.crypto.encrypt(p).map_err(|e| {
                    SshError::Config(format!("Encryption failed: {}", e))
                })
            }).transpose()?;
            
            sqlx::query(
                r#"
                INSERT INTO servers (name, host, port, username, password_encrypted, private_key_path, passphrase_encrypted)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    host = excluded.host,
                    port = excluded.port,
                    username = excluded.username,
                    password_encrypted = excluded.password_encrypted,
                    private_key_path = excluded.private_key_path,
                    passphrase_encrypted = excluded.passphrase_encrypted,
                    updated_at = CURRENT_TIMESTAMP
                "#,
            )
            .bind(&config.name)
            .bind(&config.host)
            .bind(config.port as i64)
            .bind(&config.username)
            .bind(password_encrypted.as_deref())
            .bind(config.private_key_path.as_deref())
            .bind(passphrase_encrypted.as_deref())
            .execute(&mut *tx)
            .await?;
        }
        
        tx.commit().await?;
        Ok(())
    }
}
```

#### 步骤 6.2: 添加 Tauri 命令

**文件**: `src-tauri/src/commands.rs` (修改)

```rust
#[tauri::command]
pub async fn save_servers_batch(
    configs: Vec<ServerConfig>,
    state: State<'_, Arc<ConfigManager>>,
) -> Result<()> {
    state.save_servers_batch(&configs).await
}
```

### 验收标准

- [ ] 批量保存原子性（事务）
- [ ] 性能优于逐个保存（10+ 条记录时）
- [ ] 错误回滚正确

---

## 阶段 7: CSP 配置（可选）(🟢 P3)

### 实施方案

**文件**: `src-tauri/tauri.conf.json` (修改)

```json
{
  "app": {
    "security": {
      "csp": "default-src 'self'; connect-src 'self' tauri://; script-src 'self'; style-src 'self' 'unsafe-inline'"
    }
  }
}
```

### 验收标准

- [ ] 应用正常启动
- [ ] 所有功能正常
- [ ] 控制台无 CSP 错误

---

## 阶段 8: 文档更新 (🟢 P3)

### 更新 AGENTS.md

**文件**: `AGENTS.md` (修改)

添加安全实现状态章节：

```markdown
## Security Implementation Status

### ✅ Completed
- AES-256-GCM encryption for passwords/keys
- Zeroize on CryptoManager drop
- Path traversal protection (see `security/path_validation.rs`)
- No hardcoded credentials

### 🔧 In Progress
- ServerConfig zeroize implementation
- IPC debouncing

### 📋 Pending
- CSP configuration (if adding external resources)
```

### 验收标准

- [ ] AGENTS.md 更新
- [ ] README.md 安全章节更新
- [ ] CHANGELOG.md 记录变更

---

## 📅 实施时间表

### Week 1 (安全关键)
- Day 1-2: 路径遍历防护（阶段 1）
- Day 2: Cargo Audit 集成（阶段 2）
- Day 3: IPC 防抖实现（阶段 3）

### Week 2 (性能优化)
- Day 4-5: 性能基准测试（阶段 4）
- Day 5-6: ServerConfig Zeroize（阶段 5）
- Day 7: 批量数据库操作（阶段 6）

### Week 3 (收尾)
- Day 8: CSP 配置（阶段 7，可选）
- Day 8: 文档更新（阶段 8）
- Day 9: 集成测试
- Day 10: 代码审查 & 发布

---

## ✅ 完成检查清单

### 安全
- [ ] 路径遍历防护实现并测试
- [ ] Cargo Audit 无 Critical/High 漏洞
- [ ] ServerConfig 密码清理
- [ ] 无硬编码凭证（已验证）

### 性能
- [ ] IPC 防抖实现
- [ ] 性能基准测试运行
- [ ] 批量数据库操作实现

### 质量
- [ ] 所有单元测试通过
- [ ] 所有集成测试通过
- [ ] 文档更新完成
- [ ] CI/CD 配置完成

---

## 🔧 所需工具

```bash
# Rust 工具链
rustup component add clippy rustfmt

# 安全工具
cargo install cargo-audit

# Node.js 工具链（前端）
pnpm install -g typescript
```

---

**计划批准**: ⏳ Pending  
**开始日期**: TBD  
**预计完成**: TBD
