# 需求文档 - HeTaoSSH 代码质量整改

## 介绍

本文档定义了 HeTaoSSH 项目代码质量整改的需求。基于 2026-03-17 的代码审查报告，项目需要进行系统性的代码质量提升，包括清理临时文件、消除代码重复、改善代码规范性、优化项目结构等。目标是将代码质量评分从 4/5 提升到 4.5/5，同时提高可维护性和可扩展性。

**项目背景**: HeTaoSSH 是一个使用 Tauri 2.0 + Rust + React 构建的现代 SSH 客户端，主打轻量级，目标用户是非专业的开发人员。

## 术语表

- **Project_Root**: HeTaoSSH 项目根目录
- **Rust_Backend**: src-tauri/src/ 目录下的 Rust 后端代码
- **Frontend**: web/src/ 目录下的 React 前端代码
- **SFTP_Commands**: 处理 SFTP 文件操作的 Tauri 命令集合
- **Path_Validation**: 路径遍历攻击防护逻辑
- **IPC**: Tauri 前后端进程间通信机制
- **Actor_Model**: SSH 连接管理使用的并发模型
- **Temporary_Files**: 开发过程中产生的临时调试文件（*.txt, *.log）
- **Draft_Files**: .sisyphus/drafts/ 目录下的草稿文档
- **Magic_Numbers**: 代码中未定义为常量的硬编码数值
- **Code_Duplication**: 在多处重复出现的相同或相似代码逻辑

## 需求

### 需求 1: 清理临时文件和无用代码

**用户故事**: 作为项目维护者，我希望清理所有临时文件和无用代码，以便保持代码库整洁并减少版本控制噪音。

#### 验收标准

1. WHEN 检查 src-tauri/ 目录时，THE System SHALL 删除所有临时调试文件（check_output.txt, output.txt, output_utf8.txt, test_output.log）
2. WHEN 检查 .gitignore 文件时，THE System SHALL 包含临时文件模式（*.txt, *.log, HetaoSSH/）以防止未来提交
3. WHEN 检查 .sisyphus/drafts/ 目录时，THE System SHALL 将有价值的文档迁移到 docs/ 目录或删除过时草稿
4. WHEN 检查 web/ 目录时，THE System SHALL 删除未使用的配置文件（vite.config.js，仅保留 vite.config.ts）
5. WHEN 检查 src-tauri/HetaoSSH/ 目录时，THE System SHALL 将该目录添加到 .gitignore（数据库文件应在运行时创建）
6. WHEN 运行 pnpm lint 时，THE System SHALL 修复所有未使用的导入警告
7. WHEN 检查 src-tauri/src/crypto/mod.rs 时，THE System SHALL 删除注释掉的测试代码注释或恢复测试

### 需求 2: 消除代码重复

**用户故事**: 作为开发者，我希望消除重复代码，以便降低维护成本并减少潜在的不一致性。

#### 验收标准

1. WHEN 处理路径验证时，THE System SHALL 提供统一的 validate_path 函数用于所有 SFTP 命令
2. WHEN 路径验证失败时，THE System SHALL 返回一致的错误消息
3. FOR ALL SFTP 命令（sftp_list_dir, sftp_read_file, sftp_write_file, sftp_delete, sftp_rename, sftp_create_dir, sftp_download, sftp_upload），调用 validate_path 后解析结果 SHALL 产生相同的行为
4. WHEN 判断本地或远程文件系统时，THE System SHALL 使用统一的抽象层而非在每个命令中重复判断逻辑
5. WHEN 在 Terminal.tsx 中调整终端大小时，THE System SHALL 使用单一的 fitTerminal 函数而非重复实现
6. FOR ALL 重复的路径验证调用，提取前后的代码 SHALL 保持功能等价性

### 需求 3: 改善代码规范性

**用户故事**: 作为代码审查者，我希望代码具有清晰的注释和一致的规范，以便快速理解复杂逻辑。

#### 验收标准

1. WHEN 阅读 src-tauri/src/ssh/manager.rs 中的 connection_actor 函数时，THE System SHALL 提供文档注释说明 Actor 模型的职责和工作流程
2. WHEN 检查代码中的数值常量时，THE System SHALL 将所有魔法数字定义为命名常量（如 IPC_DEBOUNCE_MS = 5, CONNECTION_TIMEOUT_SECS = 15）
3. WHEN 检查 src-tauri/src/error.rs 时，THE System SHALL 提供统一的错误消息常量模块（如 messages::PATH_TRAVERSAL）
4. WHEN 检查 TypeScript 代码时，THE System SHALL 避免使用 any 类型并提供明确的类型注解
5. WHEN 检查 Rust 代码时，THE System SHALL 为所有公共函数和复杂私有函数提供文档注释
6. WHEN 检查导入语句时，THE System SHALL 遵循约定的排序规则（std → external → local）

### 需求 4: 优化项目结构

**用户故事**: 作为开发者，我希望项目结构更加模块化，以便更容易定位和修改特定功能。

#### 验收标准

1. WHEN 检查 src-tauri/src/commands.rs 文件时，THE System SHALL 将 SFTP 相关命令提取到独立的 commands/sftp.rs 模块
2. WHEN 检查 src-tauri/src/commands.rs 文件时，THE System SHALL 将 SSH 相关命令提取到独立的 commands/ssh.rs 模块
3. WHEN 检查 src-tauri/src/commands.rs 文件时，THE System SHALL 将系统相关命令提取到独立的 commands/system.rs 模块
4. WHEN 检查 web/src/App.tsx 文件（500+ 行）时，THE System SHALL 将其拆分为更小的子组件（WorkspaceArea, SidebarArea, ContentArea）
5. WHEN 检查模块导出时，THE System SHALL 在 commands/mod.rs 中正确重新导出所有命令函数
6. WHEN 检查 src-tauri/src/lib.rs 时，THE System SHALL 更新 invoke_handler 以包含所有重构后的命令

### 需求 5: 完善文档

**用户故事**: 作为新贡献者，我希望有完整的 API 文档和架构说明，以便快速了解项目结构。

#### 验收标准

1. WHEN 检查 docs/API.md 时，THE System SHALL 为所有 Tauri 命令提供完整的文档（参数、返回值、错误类型）
2. WHEN 检查 docs/ 目录时，THE System SHALL 包含 architecture.md 文件说明系统架构和模块关系
3. WHEN 检查 docs/ 目录时，THE System SHALL 包含 data-flow.md 文件说明前后端数据流
4. WHEN 检查 docs/ 目录时，THE System SHALL 包含 security-model.md 文件说明安全机制（加密、路径验证、IPC 防抖）
5. WHEN 检查重构后的代码时，THE System SHALL 在关键模块顶部提供模块级文档注释

### 需求 6: 添加核心测试

**用户故事**: 作为质量保证人员，我希望关键功能有测试覆盖，以便在重构时验证功能正确性。

#### 验收标准

1. WHEN 检查 src-tauri/src/ssh/connection.rs 时，THE System SHALL 包含连接超时测试
2. WHEN 检查 src-tauri/src/ssh/connection.rs 时，THE System SHALL 包含重连逻辑测试
3. WHEN 检查 src-tauri/src/crypto/mod.rs 时，THE System SHALL 包含加密解密往返测试
4. WHEN 检查 src-tauri/src/commands/sftp.rs 时，THE System SHALL 包含路径验证集成测试
5. WHEN 检查 web/test/ 目录时，THE System SHALL 包含 Terminal 组件的基本交互测试
6. WHEN 运行 cargo test 时，THE System SHALL 所有测试通过且覆盖率提升至至少 30%

### 需求 7: 性能优化

**用户故事**: 作为用户，我希望应用响应更快，以便获得更流畅的使用体验。

#### 验收标准

1. WHEN 检查 src-tauri/src/config/mod.rs 时，THE System SHALL 在 servers 表的 host 和 name 列上创建索引
2. WHEN 检查 web/src/App.tsx 时，THE System SHALL 优化 useMemo 依赖项以减少不必要的重渲染
3. WHEN 检查 SFTP 文件操作时，THE System SHALL 提供批量操作命令（sftp_batch_download, sftp_batch_upload）以减少 IPC 开销
4. WHEN 检查前端组件时，THE System SHALL 使用 React.memo 包装纯展示组件以避免不必要的重渲染

### 需求 8: 增强安全性

**用户故事**: 作为安全审计员，我希望应用遵循安全最佳实践，以便降低潜在风险。

#### 验收标准

1. WHEN 检查 tauri.conf.json 时，THE System SHALL 配置基本的 CSP 策略（default-src 'self'; style-src 'self' 'unsafe-inline'）
2. WHEN 检查 web/src/components/ServerFormDialog.tsx 时，THE System SHALL 提供密码强度验证和视觉反馈
3. WHEN 检查 src-tauri/src/ssh/manager.rs 时，THE System SHALL 实现空闲超时机制（30 分钟无活动自动断开）
4. WHEN 检查 src-tauri/src/config/mod.rs 时，THE System SHALL 在密码解密失败时返回明确错误而非静默降级

### 需求 9: 改进用户体验

**用户故事**: 作为终端用户，我希望应用提供友好的错误提示和加载状态，以便更好地理解应用状态。

#### 验收标准

1. WHEN 检查 web/src/components/FileTree.tsx 时，THE System SHALL 在加载时显示骨架屏而非空白
2. WHEN 检查错误处理逻辑时，THE System SHALL 将技术错误消息转换为用户友好的本地化消息
3. WHEN 连接失败时，THE System SHALL 提供具体的错误原因（如"无法连接到服务器"而非"Connection refused"）
4. WHEN 认证失败时，THE System SHALL 提示"用户名或密码错误"而非显示原始错误堆栈

### 需求 10: 修复潜在 Bug

**用户故事**: 作为开发者，我希望修复已识别的潜在问题，以便提高应用稳定性。

#### 验收标准

1. WHEN 检查 web/src/stores/ssh-store.ts 时，THE System SHALL 将 inputBuffers 和 inputTimers 移到 store 内部管理以避免竞态条件
2. WHEN 检查 src-tauri/src/config/mod.rs 时，THE System SHALL 在密码解密失败时返回 SshError::Encryption 而非返回 None
3. WHEN 快速切换标签页时，THE System SHALL 正确清理前一个标签页的输入缓冲区和定时器
4. WHEN 组件卸载时，THE System SHALL 确保所有 ResizeObserver 和事件监听器被正确清理

## 特殊需求指导

### 代码重构安全性

**重构路径验证逻辑时的要求**:
- 必须保持现有的 8 个单元测试通过
- 必须在所有 SFTP 命令中调用统一的验证函数
- 必须保持相同的错误消息格式以确保前端兼容性
- 必须在重构后运行完整的测试套件验证功能等价性

**示例重构前后对比**:

重构前:
```rust
pub async fn sftp_list_dir(path: String) -> Result<Vec<SftpEntry>> {
    if contains_traversal_pattern(&path) {
        return Err(SshError::Config("Path traversal detected...".into()));
    }
    // 实现逻辑
}
```

重构后:
```rust
fn validate_path(path: &str) -> Result<()> {
    if contains_traversal_pattern(path) {
        return Err(SshError::Config(
            "Path traversal detected: suspicious pattern in path".into()
        ));
    }
    Ok(())
}

pub async fn sftp_list_dir(path: String) -> Result<Vec<SftpEntry>> {
    validate_path(&path)?;
    // 实现逻辑
}
```

### 文件拆分策略

**拆分 commands.rs 时的要求**:
- 创建 src-tauri/src/commands/mod.rs 作为模块入口
- 创建 src-tauri/src/commands/sftp.rs 包含所有 SFTP 命令
- 创建 src-tauri/src/commands/ssh.rs 包含所有 SSH 命令
- 创建 src-tauri/src/commands/system.rs 包含系统监控命令
- 在 mod.rs 中重新导出所有公共函数
- 更新 src-tauri/src/lib.rs 中的导入路径

### 测试要求

**必须包含的测试类型**:
1. 单元测试: 测试独立函数（如 validate_path）
2. 集成测试: 测试 SFTP 命令端到端流程
3. 往返测试: 测试加密/解密、序列化/反序列化
4. 错误条件测试: 测试各种错误输入的处理

**测试覆盖率目标**:
- Rust 后端: 从 <10% 提升到 30%+
- 关键模块（security, crypto, ssh）: 60%+
- 前端: 从 <5% 提升到 20%+

## 迭代和反馈规则

- 模型必须在用户请求修改时进行调整
- 模型必须在继续下一阶段前整合所有用户反馈
- 模型必须在发现需求缺口时提供返回上一步的选项

## 阶段完成

完成本阶段文档后，模型必须停止。用户将通过 UI 按钮进入下一阶段。
