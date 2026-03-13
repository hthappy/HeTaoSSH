# HeTaoSSH 实施计划 - 快速参考卡片

**版本**: v1.1 (修订版) | **日期**: 2026-03-11 | **总工时**: 5.5 小时

---

## 📌 一句话总结

**本期聚焦**: 修复路径遍历安全漏洞 + 提升稳定性  
**移除任务**: 性能测量、批量 DB、Zeroize（无此使用场景）

---

## ✅ 本期任务清单

### 🔴 P0: 路径遍历防护 (2h) — 必须完成

**目标**: 防止 `../` 攻击访问任意文件

**步骤**:
```bash
# 1. 创建模块
src-tauri/src/security/path_validation.rs

# 2. 实现函数
validate_and_normalize_path(base_dir, requested_path)

# 3. 集成到命令
- sftp_read_file()
- sftp_write_file()
- sftp_list_dir()

# 4. 测试
cargo test path_validation -- --nocapture
```

**验收**: `../../etc/passwd` 返回错误 ✅

---

### 🟡 P1: Cargo Audit (0.5h) — 应该完成

**目标**: 自动化依赖漏洞扫描

**步骤**:
```bash
# 安装
cargo install cargo-audit

# 运行
cd src-tauri && cargo audit

# 修复发现的 Critical/High 漏洞
```

**验收**: 无漏洞警告 ✅

---

### 🟡 P1: IPC 防抖 (1h) — 应该完成

**目标**: 防止前端高频调用后端

**步骤**:
```typescript
// web/src/stores/ssh-store.ts
import { debounce } from 'lodash-es'

const sendToTerminalDebounced = debounce(
  async (serverId, data) => {
    await invoke('ssh_send', { tabId: `conn-${serverId}`, data })
  },
  50 // 50ms 防抖
)
```

**验收**: 快速输入时调用次数减少 ✅

---

### 🟢 P3: 集成测试 (1h) — 新增

**测试清单**:
- [ ] 路径遍历攻击被阻止
- [ ] IPC 调用频率降低
- [ ] 无 cargo audit 漏洞
- [ ] 应用功能正常

---

### 🟢 P3: 文档更新 (0.5h) — 可选

**更新文件**:
- `AGENTS.md` - 添加安全实现状态
- `.sisyphus/drafts/implementation-plan-revised.md` - 本计划

---

### 🟢 P3: CSP 配置 (0.5h) — 可选

**仅当添加外部资源时配置**

```json
// src-tauri/tauri.conf.json
{
  "app": { "security": { "csp": "default-src 'self'" } }
}
```

---

## ❌ 已移除（本期不做）

| 任务 | 原因 |
|------|------|
| 性能基准测试 | 单用户桌面应用，无压力 |
| 批量数据库操作 | 无大批量导入需求 |
| ServerConfig Zeroize | 已加密存储，Rust 自动 Drop |

---

## 📅 3 天完成计划

| 时间 | 任务 | 交付物 |
|------|------|--------|
| **Day 1 上午** | 路径遍历防护 | `path_validation.rs` + 测试 |
| **Day 1 下午** | 路径遍历集成 | 所有 SFTP 命令更新 |
| **Day 2 上午** | Cargo Audit | 无漏洞报告 |
| **Day 2 下午** | IPC 防抖 | `ssh-store.ts` 更新 |
| **Day 3 上午** | 集成测试 | 测试通过报告 |
| **Day 3 下午** | 文档更新 | AGENTS.md 更新 |

---

## 🎯 成功标准

- ✅ 无法通过 `../` 访问文件
- ✅ `cargo audit` 无警告
- ✅ 快速输入无明显延迟
- ✅ 所有功能正常

---

## 🛠️ 快速命令

```bash
# 安全检查
cargo audit

# 测试路径验证
cargo test path_validation

# 运行应用
pnpm tauri dev

# 构建 release
pnpm tauri build
```

---

## 📋 文件清单

### 新建
- `src-tauri/src/security/mod.rs`
- `src-tauri/src/security/path_validation.rs`

### 修改
- `src-tauri/src/commands.rs` (SFTP 命令加验证)
- `src-tauri/src/lib.rs` (导出 security 模块)
- `web/src/stores/ssh-store.ts` (IPC 防抖)
- `AGENTS.md` (文档更新)

### 可选新建
- `.github/workflows/security.yml` (CI 自动审计)

---

## ⚠️ 注意事项

1. **路径验证**: 确保测试覆盖 `../`, `..\\`, 绝对路径
2. **IPC 防抖**: 防抖窗口 50ms，避免影响用户体验
3. **Cargo Audit**: 发现漏洞先评估，再决定是否升级

---

**打印此卡片作为快速参考！** 📄
