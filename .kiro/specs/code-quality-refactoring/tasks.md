# 实施任务清单 - HeTaoSSH 代码质量整改

## 概述

本任务清单基于需求文档和技术设计文档，将代码质量整改工作分解为可执行的具体任务。所有任务按照 4 个阶段组织，每个阶段独立可测试。

## 阶段 1: 清理和准备（1-2 天）

### 目标
清理所有临时文件和无用代码，建立清晰的项目结构，为后续重构做准备。

- [x] 1. 清理临时文件和更新 .gitignore
  - 删除 `src-tauri/check_output.txt`, `src-tauri/output.txt`, `src-tauri/output_utf8.txt`, `src-tauri/test_output.log`
  - 将 `src-tauri/HetaoSSH/` 目录添加到 .gitignore
  - 在 .gitignore 中添加 `src-tauri/*.txt` 和 `src-tauri/*.log` 模式
  - 运行 `git status` 验证临时文件不再被跟踪
  - _需求: 1.1, 1.2, 1.5_

- [x] 2. 整理草稿文档
  - 删除 `.sisyphus/drafts/implementation-plan-revised.md` 和 `implementation-plan.md`（已过时）
  - 创建 `docs/testing/` 目录
  - 将 `.sisyphus/drafts/integration-test-report.md` 迁移到 `docs/testing/integration-tests.md`
  - 审查 `.sisyphus/drafts/quick-reference.md` 内容，将有价值部分合并到 `AGENTS.md`
  - 创建 `docs/security/` 目录
  - 将 `.sisyphus/drafts/security-performance-status.md` 迁移到 `docs/security/security-status.md`
  - _需求: 1.3_

- [x] 3. 清理无用代码和配置
  - 删除 `web/vite.config.js`（保留 `vite.config.ts`）
  - 检查 `src-tauri/src/crypto/mod.rs` 中的测试注释，删除或恢复测试
  - 运行 `cd web && pnpm lint --fix` 清理未使用的导入
  - 运行 `cd src-tauri && cargo fmt` 格式化 Rust 代码
  - 运行 `cd src-tauri && cargo clippy -- -D warnings` 检查并修复 lint 警告
  - _需求: 1.4, 1.6, 1.7_

- [x] 4. 验证阶段 1 完成
  - 运行 `git status` 确认无临时文件
  - 确认所有文档在 `docs/` 目录下组织良好
  - 确认 lint 无警告
  - 提交代码并打 tag: `git tag -a v0.3.8-cleanup -m "Phase 1: Cleanup completed"`


## 阶段 2: 代码重构（3-5 天）

### 目标
消除代码重复，优化模块结构，提高代码可维护性和可复用性。

- [x] 5. 创建统一的路径验证模块
  - [x] 5.1 创建 `src-tauri/src/security/validation.rs` 文件
    - 实现 `validate_sftp_path(path: &str) -> Result<()>` 函数
    - 函数内部调用 `contains_traversal_pattern()` 进行验证
    - 失败时返回 `SshError::Config(messages::PATH_TRAVERSAL.into())`
    - _需求: 2.1, 2.2_

  - [x] 5.2 为路径验证添加单元测试
    - 测试安全路径（"file.txt", "dir/file.txt", "./file.txt"）
    - 测试危险路径（"../etc/passwd", "file\0.txt", "dir/../file"）
    - 验证错误消息一致性
    - _需求: 2.2, 6.4_

  - [x] 5.3 更新 `src-tauri/src/security/mod.rs` 导出新函数
    - 添加 `pub mod validation;`
    - 添加 `pub use validation::validate_sftp_path;`
    - _需求: 2.1_

  - [x] 5.4 在所有 SFTP 命令中使用统一验证
    - 在 `commands.rs` 中导入 `use crate::security::validation::validate_sftp_path;`
    - 替换 8 个 SFTP 命令中的重复验证代码为 `validate_sftp_path(&path)?;`
    - 命令包括: sftp_list_dir, sftp_read_file, sftp_write_file, sftp_remove_file, sftp_create_dir, sftp_download_file, sftp_download_dir, sftp_upload_file
    - _需求: 2.1, 2.3_

  - [x] 5.5 验证路径验证重构
    - 运行 `cargo test` 确保所有现有的 8 个路径验证测试通过
    - 手动测试 SFTP 文件操作功能
    - _需求: 2.6_

- [x] 6. 添加错误消息常量模块
  - [x] 6.1 在 `src-tauri/src/error.rs` 中添加 messages 模块
    - 定义路径安全常量: PATH_TRAVERSAL
    - 定义连接错误常量: CONNECTION_TIMEOUT, CONNECTION_FAILED, AUTH_FAILED
    - 定义 SFTP 错误常量: SFTP_NOT_INITIALIZED, SFTP_FILE_NOT_FOUND, SFTP_PERMISSION_DENIED
    - 定义加密错误常量: ENCRYPTION_FAILED, DECRYPTION_FAILED, KEYRING_ACCESS_FAILED
    - 定义配置错误常量: INVALID_CONFIG, DATABASE_ERROR
    - _需求: 3.3_

  - [x] 6.2 更新代码使用错误消息常量
    - 在 `security/validation.rs` 中使用 `messages::PATH_TRAVERSAL`
    - 在 `ssh/manager.rs` 中使用连接相关常量
    - 在 `config/mod.rs` 中使用配置和加密相关常量
    - _需求: 3.3_

- [x] 7. 常量化魔法数字
  - [x] 7.1 在 `src-tauri/src/ssh/manager.rs` 中定义常量
    - `CONNECTION_TIMEOUT_SECS: u64 = 15`
    - `MAX_RECONNECT_ATTEMPTS: usize = 2`
    - `MONITOR_REFRESH_INTERVAL_SECS: u64 = 2`
    - `IDLE_TIMEOUT_SECS: u64 = 1800`
    - 替换代码中的硬编码数值
    - _需求: 3.2_

  - [x] 7.2 在 `web/src/constants/ipc.ts` 中定义前端常量
    - 创建 `web/src/constants/` 目录
    - 定义 `IPC_DEBOUNCE_MS = 5`
    - 定义 `IPC_MAX_WAIT_MS = 150`
    - 定义 `UPLOAD_CHUNK_SIZE = 32768`
    - 在 `ssh-store.ts` 中使用这些常量
    - _需求: 3.2_


- [x] 8. 拆分 commands.rs 为模块化结构
  - [x] 8.1 创建 commands 模块目录和文件
    - 创建 `src-tauri/src/commands/` 目录
    - 创建 `src-tauri/src/commands/mod.rs`
    - 创建 `src-tauri/src/commands/sftp.rs`
    - 创建 `src-tauri/src/commands/ssh.rs`
    - 创建 `src-tauri/src/commands/system.rs`
    - 创建 `src-tauri/src/commands/config.rs`
    - _需求: 4.1, 4.2, 4.3_

  - [x] 8.2 迁移 SFTP 命令到 sftp.rs
    - 移动以下函数: sftp_list_dir, sftp_read_file, sftp_write_file, sftp_remove_file, sftp_create_dir, sftp_download_file, sftp_download_dir, sftp_upload_file, sftp_get_home_dir, local_list_dir, local_get_home_dir
    - 添加必要的导入语句
    - 确保所有函数保持 `#[tauri::command]` 属性
    - _需求: 4.1_

  - [x] 8.3 迁移 SSH 命令到 ssh.rs
    - 移动以下函数: ssh_connect, ssh_disconnect, ssh_send, ssh_recv, ssh_resize, test_connection
    - 添加必要的导入语句
    - _需求: 4.2_

  - [x] 8.4 迁移系统命令到 system.rs
    - 移动以下函数: get_system_usage, fetch_url, open_local_terminal, local_term_write, local_term_resize, local_term_close
    - 添加必要的导入语句
    - _需求: 4.3_

  - [x] 8.5 迁移配置命令到 config.rs
    - 移动以下函数: list_servers, save_server, delete_server, save_session, get_session, list_snippets, list_snippet_categories, save_snippet, delete_snippet, parse_theme, ping, get_version
    - 添加必要的导入语句
    - _需求: 4.3_

  - [x] 8.6 更新 commands/mod.rs 导出所有命令
    - 添加 `mod sftp; mod ssh; mod system; mod config;`
    - 添加 `pub use sftp::*; pub use ssh::*; pub use system::*; pub use config::*;`
    - _需求: 4.5_

  - [x] 8.7 更新 lib.rs 中的 invoke_handler
    - 更新导入路径为 `use crate::commands::*;`
    - 确保 `invoke_handler` 包含所有命令
    - _需求: 4.6_

  - [x] 8.8 删除原 commands.rs 文件
    - 确认所有功能已迁移
    - 删除 `src-tauri/src/commands.rs`
    - _需求: 4.1_

  - [x] 8.9 验证 commands 模块拆分
    - 运行 `cargo check` 验证编译
    - 运行 `cargo test` 验证所有测试通过
    - 手动测试前端功能（连接、文件操作、系统监控）
    - _需求: 4.1_

- [ ] 9. 实现文件系统后端抽象（可选优化）
  - [ ] 9.1 在 commands/sftp.rs 中定义 FileSystemBackend 枚举
    - 定义 `enum FileSystemBackend<'a> { Local, Remote(&'a Arc<ConnectionManager>, &'a str) }`
    - 实现 `from_tab_id()` 方法
    - 实现 `list_dir()`, `read_file()`, `write_file()`, `remove_file()`, `create_dir()` 方法
    - _需求: 2.4_

  - [ ] 9.2 重构 SFTP 命令使用 FileSystemBackend
    - 在每个 SFTP 命令中使用 `FileSystemBackend::from_tab_id()`
    - 替换重复的 `if tab_id.starts_with("local-")` 判断
    - _需求: 2.4_

  - [ ] 9.3 验证文件系统抽象
    - 测试本地文件操作
    - 测试远程文件操作
    - 确保功能等价
    - _需求: 2.4_


- [x] 10. 添加文档注释
  - [x] 10.1 为 ssh/manager.rs 添加文档注释
    - 为 `connection_actor()` 函数添加详细文档注释
    - 说明 Actor 模型的职责、生命周期、错误处理
    - _需求: 3.1, 3.5_

  - [x] 10.2 为其他公共 API 添加文档注释
    - 为 `security/validation.rs` 中的公共函数添加注释
    - 为 `commands/` 模块中的 Tauri 命令添加注释
    - 为 `crypto/mod.rs` 中的公共方法添加注释
    - _需求: 3.5_

- [-] 11. 前端代码重构
  - [ ] 11.1 提取 useTerminalFit Hook
    - 创建 `web/src/hooks/useTerminalFit.ts`
    - 实现 `useTerminalFit()` Hook，返回 `{ xtermRef, fitAddonRef, fitTerminal }`
    - _需求: 2.5_

  - [ ] 11.2 在 Terminal.tsx 中使用 useTerminalFit
    - 导入并使用 `useTerminalFit()` Hook
    - 替换所有重复的 fitTerminal 逻辑
    - 添加窗口 resize 事件监听
    - _需求: 2.5_

  - [ ] 11.3 拆分 App.tsx 组件（可选）
    - 创建 `web/src/components/layout/` 目录
    - 创建 `WorkspaceArea.tsx` 组件（标签页管理）
    - 创建 `SidebarArea.tsx` 组件（侧边栏）
    - 创建 `ContentArea.tsx` 组件（内容区）
    - 在 App.tsx 中使用这些子组件
    - _需求: 4.4_

- [ ] 12. 验证阶段 2 完成
  - 运行 `cargo test` 确保所有测试通过
  - 运行 `cargo check` 确保无编译错误
  - 运行 `cd web && pnpm build` 确保前端编译成功
  - 手动测试所有核心功能（SSH 连接、SFTP 操作、终端交互）
  - 提交代码并打 tag: `git tag -a v0.3.8-refactor -m "Phase 2: Refactoring completed"`

## 阶段 3: 测试和文档（2-3 天）

### 目标
添加核心测试，提升测试覆盖率，完善项目文档。

- [ ] 13. 添加后端核心测试
  - [ ] 13.1 添加 crypto 模块测试
    - 在 `src-tauri/src/crypto/mod.rs` 中添加测试模块
    - 测试加密解密往返（encrypt -> decrypt 应得到原始数据）
    - 测试解密失败场景（损坏数据应返回错误）
    - 测试密钥清理（Drop trait）
    - _需求: 6.3_

  - [ ] 13.2 添加 ssh/connection 模块测试
    - 在 `src-tauri/src/ssh/connection.rs` 中添加测试模块
    - 测试连接超时（使用 tokio::time::timeout）
    - 测试重连逻辑（模拟连接断开和恢复）
    - _需求: 6.1, 6.2_

  - [ ] 13.3 添加 commands/sftp 集成测试
    - 在 `src-tauri/src/commands/sftp.rs` 中添加测试模块
    - 测试路径验证集成（调用 SFTP 命令验证路径检查）
    - 测试本地文件操作
    - _需求: 6.4_

  - [ ] 13.4 运行测试并检查覆盖率
    - 运行 `cargo test` 确保所有测试通过
    - 运行 `cargo tarpaulin --out Html` 生成覆盖率报告
    - 确认后端覆盖率达到 30%+
    - _需求: 6.6_


- [ ] 14. 添加前端测试
  - [ ] 14.1 添加工具函数测试
    - 创建 `web/src/utils/passwordStrength.test.ts`
    - 测试密码强度验证逻辑（weak, medium, strong）
    - 创建 `web/src/utils/errorMessages.test.ts`
    - 测试错误消息友好化转换
    - _需求: 6.5_

  - [ ] 14.2 添加组件测试
    - 创建 `web/src/components/FileTree.test.tsx`
    - 测试加载状态（骨架屏显示）
    - 测试文件列表渲染
    - _需求: 6.5_

  - [ ] 14.3 运行前端测试并检查覆盖率
    - 运行 `cd web && pnpm test` 确保所有测试通过
    - 运行 `cd web && pnpm test:coverage` 生成覆盖率报告
    - 确认前端覆盖率达到 20%+
    - _需求: 6.6_

- [ ] 15. 编写架构文档
  - [ ] 15.1 创建 docs/architecture.md
    - 说明系统整体架构（前后端分离、Tauri IPC）
    - 说明后端模块结构（commands, ssh, config, crypto, security）
    - 说明前端架构（React, Zustand, xterm.js）
    - 包含架构图（可使用 ASCII 或 Mermaid）
    - _需求: 5.2_

  - [ ] 15.2 创建 docs/data-flow.md
    - 说明前后端数据流（IPC 调用流程）
    - 说明 SSH 连接生命周期
    - 说明 SFTP 文件操作流程
    - 说明状态管理（Zustand store）
    - _需求: 5.3_

  - [ ] 15.3 创建 docs/security-model.md
    - 说明加密机制（AES-256-GCM, 主密钥存储）
    - 说明路径验证机制（防止路径遍历）
    - 说明 IPC 防抖机制
    - 说明安全最佳实践
    - _需求: 5.4_

- [ ] 16. 完善 API 文档
  - [ ] 16.1 更新 docs/API.md
    - 为所有 SFTP 命令添加文档（参数、返回值、错误类型）
    - 为所有 SSH 命令添加文档
    - 为所有系统命令添加文档
    - 为所有配置命令添加文档
    - 添加使用示例
    - _需求: 5.1_

  - [ ] 16.2 添加模块级文档注释
    - 在 `commands/mod.rs` 顶部添加模块说明
    - 在 `security/mod.rs` 顶部添加模块说明
    - 在 `crypto/mod.rs` 顶部添加模块说明
    - _需求: 5.5_

- [ ] 17. 验证阶段 3 完成
  - 确认所有测试通过（后端和前端）
  - 确认测试覆盖率达标（后端 30%+，前端 20%+）
  - 确认所有文档完整且准确
  - 提交代码并打 tag: `git tag -a v0.3.8-testing -m "Phase 3: Testing completed"`


## 阶段 4: 优化和增强（3-4 天）

### 目标
性能优化，安全增强，用户体验改进，修复已知 bug。

- [ ] 18. 数据库性能优化
  - [ ] 18.1 创建数据库迁移模块
    - 创建 `src-tauri/src/config/migrations.rs`
    - 实现 `apply_performance_optimizations(pool: &SqlitePool) -> Result<()>` 函数
    - _需求: 7.1_

  - [ ] 18.2 添加数据库索引
    - 为 servers 表的 host 列创建索引
    - 为 servers 表的 name 列创建索引
    - 为 snippets 表的 category 列创建索引
    - _需求: 7.1_

  - [ ] 18.3 在 ConfigManager::new() 中调用迁移
    - 在初始化数据库连接池后调用 `apply_performance_optimizations()`
    - 添加错误处理和日志记录
    - _需求: 7.1_

  - [ ] 18.4 验证数据库优化
    - 测试数据库查询性能（使用 EXPLAIN QUERY PLAN）
    - 确认索引已创建
    - _需求: 7.1_

- [ ] 19. 实现批量 SFTP 操作
  - [ ] 19.1 实现批量下载命令
    - 在 `commands/sftp.rs` 中添加 `sftp_batch_download()` 命令
    - 接受 `Vec<(String, String)>` 参数（remote_path, local_path pairs）
    - 返回 `Vec<Result<()>>` 结果
    - 对每个文件调用路径验证
    - _需求: 7.3_

  - [ ] 19.2 实现批量上传命令
    - 在 `commands/sftp.rs` 中添加 `sftp_batch_upload()` 命令
    - 接受 `Vec<(String, String)>` 参数（local_path, remote_path pairs）
    - 返回 `Vec<Result<()>>` 结果
    - _需求: 7.3_

  - [ ] 19.3 更新 lib.rs 注册批量命令
    - 在 `invoke_handler` 中添加 `sftp_batch_download` 和 `sftp_batch_upload`
    - _需求: 7.3_

  - [ ] 19.4 前端集成批量操作（可选）
    - 在前端添加批量下载/上传功能
    - 显示批量操作结果
    - _需求: 7.3_

- [ ] 20. 前端性能优化
  - [ ] 20.1 优化 useMemo 依赖
    - 检查 `web/src/App.tsx` 中的 useMemo 使用
    - 提取纯函数，减少不必要的依赖
    - 例如: 将 `displayServerName` 提取为纯函数
    - _需求: 7.2_

  - [ ] 20.2 使用 React.memo 包装纯组件
    - 为 `ServerListItem` 组件添加 React.memo
    - 为其他纯展示组件添加 React.memo
    - _需求: 7.4_

  - [ ] 20.3 验证性能优化
    - 使用 React DevTools Profiler 测试渲染性能
    - 确认减少了不必要的重渲染
    - _需求: 7.2, 7.4_


- [ ] 21. 配置 CSP 安全策略
  - [ ] 21.1 更新 tauri.conf.json
    - 在 `app.security` 中配置 CSP
    - 设置 `default-src: 'self'`
    - 设置 `style-src: 'self' 'unsafe-inline'`
    - 设置 `script-src: 'self'`
    - 设置 `img-src: 'self' data:`
    - 设置 `font-src: 'self' data:`
    - 设置 `connect-src: 'self' tauri:`
    - _需求: 8.1_

  - [ ] 21.2 验证 CSP 配置
    - 运行应用，检查浏览器控制台无 CSP 违规警告
    - 测试所有功能正常工作
    - _需求: 8.1_

- [ ] 22. 实现密码强度验证
  - [ ] 22.1 创建密码强度验证工具
    - 创建 `web/src/utils/passwordStrength.ts`
    - 实现 `validatePasswordStrength(password: string): PasswordStrength` 函数
    - 根据长度和字符类型返回 'weak' | 'medium' | 'strong'
    - _需求: 8.2_

  - [ ] 22.2 创建密码强度指示器组件
    - 创建 `web/src/components/PasswordStrengthIndicator.tsx`
    - 显示密码强度（颜色条或文字）
    - _需求: 8.2_

  - [ ] 22.3 在 ServerFormDialog 中集成密码强度验证
    - 导入并使用 `validatePasswordStrength()`
    - 显示 `PasswordStrengthIndicator` 组件
    - 对弱密码显示警告提示
    - _需求: 8.2_

- [ ] 23. 实现空闲超时机制
  - [ ] 23.1 在 ssh/manager.rs 中添加空闲超时逻辑
    - 定义 `IDLE_TIMEOUT_SECS` 常量（1800 秒 = 30 分钟）
    - 在 `connection_actor()` 中添加 `last_activity` 跟踪
    - 在接收命令时更新 `last_activity`
    - 使用 `tokio::select!` 添加超时检查分支
    - 超时时发送 `ssh-idle-timeout` 事件到前端
    - _需求: 8.3_

  - [ ] 23.2 前端处理空闲超时事件
    - 在 `ssh-store.ts` 中监听 `ssh-idle-timeout` 事件
    - 显示 toast 通知用户连接已断开
    - 更新 UI 状态为 disconnected
    - _需求: 8.3_

- [ ] 24. 改进错误处理
  - [ ] 24.1 修复密码解密失败处理
    - 在 `config/mod.rs` 的 `get_server()` 方法中修改解密失败逻辑
    - 解密失败时返回 `Err(SshError::Encryption(messages::DECRYPTION_FAILED.into()))`
    - 添加错误日志记录
    - _需求: 8.4, 10.2_

  - [ ] 24.2 实现前端错误消息友好化
    - 创建 `web/src/utils/errorMessages.ts`
    - 实现 `getFriendlyErrorMessage(error: string, t: TFunction): string` 函数
    - 映射常见技术错误到用户友好消息
    - 包括: Connection refused, Connection timed out, Authentication failed, Permission denied, File not found, Path traversal, decrypt
    - _需求: 9.2, 9.3, 9.4_

  - [ ] 24.3 在前端使用友好错误消息
    - 在所有 IPC 调用的 catch 块中使用 `getFriendlyErrorMessage()`
    - 在 `ssh-store.ts` 中更新错误处理
    - 在组件中更新错误处理
    - _需求: 9.2_

