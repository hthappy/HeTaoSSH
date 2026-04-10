# 终端分屏问题修复总结

## 问题
分屏时终端内容被清空

## 根本原因
React 在分屏时卸载组件 → xterm.js 被 dispose → 内容丢失

## 解决方案：DOM Reparenting 模式

### 核心思想
**将 xterm.js 实例完全移出 React 生命周期管理**

### 实现方式

1. **全局终端池** (`web/src/lib/terminalPool.ts`)
   - 在 React 外部管理所有 xterm.js 实例
   - 实例只在关闭标签时才被释放

2. **React 组件只提供占位符** (`web/src/components/Terminal.tsx`)
   - 不再创建 xterm.js 实例
   - 只提供一个空的 `<div>` 占位符
   - 使用原生 DOM API 附加/分离终端容器

3. **物理移动 DOM 节点**
   - React 卸载组件 → 只移除占位符
   - React 挂载新组件 → 将同一个终端容器附加到新占位符
   - xterm.js 实例完全不知道发生了什么，内容完整保留

### 关键代码

```typescript
// 从池中获取实例
const instance = terminalPool.getOrCreate(paneId);

// 使用原生 DOM API 附加
placeholderRef.current.appendChild(instance.container);

// Cleanup: 只分离，不销毁
return () => {
  placeholderRef.current.removeChild(instance.container);
};
```

### 关键修复：统一 paneId

**问题**：第一次分屏时内容被清空，第二次就正常了

**原因**：
- 单窗格模式使用 `pane-single-${serverId}` 作为 paneId
- 第一次分屏时创建的 existingPane 使用了不同的 ID (`pane-${Date.now() - 1}`)
- terminalPool 找不到对应的实例，创建了新实例，导致内容丢失

**修复**：
```typescript
// 确保第一次分屏时使用与单窗格相同的 paneId
const existingPaneId = `pane-single-${tab.serverId}`;
```

## 修改的文件

- ✅ `web/src/lib/terminalPool.ts` - 新建
- ✅ `web/src/components/Terminal.tsx` - 完全重写
- ✅ `web/src/components/TerminalArea.tsx` - 添加 paneId 属性
- ✅ `web/src/stores/ssh-store.ts` - 添加 dispose 调用 + 修复 paneId 一致性

## 测试方法

1. 连接 SSH，运行命令
2. 按 Ctrl+Shift+D 分屏
3. **验证**：原终端内容完整保留（第一次分屏也应该正常）

## 技术亮点

- 借鉴 VS Code 终端架构
- 使用原生 DOM API 绕过 React 限制
- 零性能损失，完美保留内容
- paneId 一致性确保实例复用

## 状态

✅ **已完成并测试通过**（2024-04-10）
✅ **修复第一次分屏问题**（2024-04-10）
