# AGENTS.md - HeTaoSSH Development Guidelines

## Project Overview

**HeTaoSSH** - Modern SSH client built with Tauri 2.0
- **Backend**: Rust (`russh` for SSH, `sqlx` + `SQLite` for storage)
- **Frontend**: React/Vue 3 + Tailwind CSS + Shadcn/UI
- **Terminal**: xterm.js with WebGL acceleration
- **Editor**: Monaco Editor (VS Code kernel)

---

## Build & Development Commands

### Prerequisites
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh  # Install Rust
corepack enable pnpm  # Enable pnpm
pnpm install  # Install dependencies
```

### Rust Commands
```bash
cargo check                    # Check compilation (fast)
cargo build                    # Build debug
cargo build --release          # Build release
cargo test                     # Run all tests
cargo test <name> -- --exact   # Run single test (exact match)
cargo test <name> -- --nocapture  # Run with output
cargo test <name> -- --test-threads=1  # Single thread (flaky tests)
cargo fmt                      # Format code
cargo clippy -- -D warnings    # Lint
```

### Tauri & Frontend Commands
```bash
pnpm tauri dev       # Dev mode (hot reload)
pnpm tauri build     # Build production app
pnpm lint            # Frontend lint
pnpm format          # Frontend format
```

---

## Code Style Guidelines

### Rust Conventions

**Imports** - Order: `std` → external crates → local modules
```rust
use std::collections::HashMap;
use russh::{Channel, ChannelId};
use crate::config::ServerConfig;
```

**Naming**: Structs/Enums `PascalCase`, functions `snake_case`, constants `SCREAMING_SNAKE_CASE`

**Error Handling**:
```rust
#[derive(thiserror::Error, Debug)]
pub enum SshError {
    #[error("Connection failed: {0}")]
    ConnectionFailed(String),
    #[error("IO error")]
    Io(#[from] std::io::Error),
}
pub type Result<T> = std::result::Result<T, SshError>;
```

**Async**: Use tokio runtime with `RwLock` for shared state, `Mutex` for exclusive

### TypeScript/React Conventions

**Imports** - Order: React → external libs → internal modules → styles
```typescript
import React, { useState, useCallback } from 'react';
import { Terminal } from 'xterm';
import { useSshStore } from '@/stores/ssh-store';
import type { ServerConfig } from '@/types/config';
```

**Naming**: Components `PascalCase`, functions/hooks `camelCase`, types `PascalCase`, constants `UPPER_CASE`

**Component Structure**: State hooks → Refs → Effects → Handlers → Render

---

## Project Structure

```
HeTaoSSH/
├── src/                    # Rust backend
│   ├── ssh/               # SSH handling (russh)
│   ├── config/            # Configuration + SQLite storage
│   └── crypto/            # AES-256 encryption
├── src-tauri/             # Tauri config
├── web/src/               # Frontend (React/Vue)
│   ├── components/
│   ├── stores/
│   ├── hooks/
│   └── types/
└── docs/
```

---

## Testing Guidelines

### Rust Tests
```rust
#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn test_connection_success() {
        let config = ServerConfig::test_config();
        assert!(connect(&config).await.is_ok());
    }
}
```

### Frontend Tests (Vitest + React Testing Library)
```typescript
import { render, screen, fireEvent } from '@testing-library/react';
it('calls handler on click', () => {
  const handler = vi.fn();
  render(<Button onClick={handler} />);
  fireEvent.click(screen.getByRole('button'));
  expect(handler).toHaveBeenCalled();
});
```

---

## Git Commit Format

```
<type>(<scope>): <subject>
```

**Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`

**Example**: `feat(ssh): add Ed25519 key authentication support`

---

## Security Requirements

1. **Encryption**: All passwords/keys AES-256 encrypted before storage
2. **Memory**: Clear sensitive buffers after use (`zeroize` crate)
3. **Validation**: Validate all user inputs, especially file paths
4. **Auditing**: Run `cargo audit` regularly

---

## Performance Targets

- Cold start: < 1.5s | Memory per session: < 80MB | Input latency: < 50ms

---

## Common Issues

**Clippy warnings in tests**: Use `#[allow(clippy::unwrap_used)]`

## Agent Usage Guidelines

### Background Agents (Parallel Execution)

**Explore Agent** - Internal codebase search:
```typescript
task(subagent_type="explore", run_in_background=true, load_skills=[], 
  description="Find auth patterns", 
  prompt="[CONTEXT] I'm implementing SSH key auth in src-tauri/src/ssh/. [GOAL] Need to match existing auth conventions. [REQUEST] Find: key file parsing, authentication handlers, credential validation. Skip tests.")
```

**Librarian Agent** - External documentation/OSS patterns:
```typescript
task(subagent_type="librarian", run_in_background=true, load_skills=[], 
  description="Find russh auth examples", 
  prompt="[CONTEXT] Building SSH client with russh 0.50. [GOAL] Need production auth patterns. [REQUEST] Find: publickey auth flow, key file parsing, agent forwarding. Skip basic tutorials.")
```

**Collection Pattern**:
```typescript
// Launch multiple agents in parallel → continue working
// When results needed:
const result = await background_output({ task_id: "bg_xxx" })
// Cancel individually when done:
background_cancel({ taskId: "bg_xxx" }) // NEVER use all=true when Oracle running
```

### Specialist Agents

| Agent | Use Case | Cost |
|-------|----------|------|
| `oracle` | Complex architecture, debugging after 2+ failures, multi-system tradeoffs | High |
| `metis` | Pre-planning for ambiguous requirements, scope clarification | High |
| `momus` | Plan review before implementation, quality assurance | High |
| `explore` | Internal codebase grep, pattern discovery | Free |
| `librarian` | External docs, OSS examples, library best practices | Low |

### Session Continuity (MANDATORY)

Always reuse `session_id` from previous task output:
```typescript
// WRONG: Fresh task loses context
task(category="quick", load_skills=[], prompt="Fix type error in auth.ts")

// CORRECT: Preserves all context
task(session_id="ses_abc123", load_skills=[], prompt="Fix: Type error line 42")
```

---

## Frontend Architecture

### State Management (Zustand)

```typescript
import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'

interface State {
  // State fields
  servers: ServerConfig[]
  // Actions
  loadServers: () => Promise<void>
}

export const useStore = create<State>((set, get) => ({
  servers: [],
  loadServers: async () => {
    const servers = await invoke<ServerConfig[]>('list_servers')
    set({ servers })
  }
}))
```

**Patterns**:
- Use `get()` to access current state within actions
- Separate backend connection state from UI tabs
- Invoke Tauri commands via `invoke<T>()` with explicit types

### Component Structure

```typescript
import { useCallback, useState } from 'react'
import { useStore } from '@/stores/store'
import type { Config } from '@/types/config'
import { cn } from '@/lib/utils'

export function Component() {
  // 1. State hooks
  const [open, setOpen] = useState(false)
  
  // 2. Store access
  const { data, action } = useStore()
  
  // 3. Handlers
  const handleClick = useCallback(() => {
    action()
  }, [action])
  
  // 4. Render
  return <div className={cn('base', open && 'open')} />
}
```

### CRITICAL: Terminal Component Architecture

**⚠️ DO NOT modify Terminal component without understanding DOM Reparenting pattern**

The Terminal component uses a special **DOM Reparenting** pattern to manage xterm.js instances outside React's lifecycle. This is critical for preserving terminal content during split pane operations.

**Key Architecture Rules**:

1. **Global Terminal Pool** (`web/src/lib/terminalPool.ts`):
   - All xterm.js instances are managed in a global pool OUTSIDE React
   - Instances are created once and reused forever
   - Only disposed when tab is closed, NEVER during splits

2. **Terminal Component** (`web/src/components/Terminal.tsx`):
   - Component only provides a placeholder `<div>` (NOT the actual terminal container)
   - Uses native DOM API (`appendChild`/`removeChild`) to attach/detach containers
   - NEVER calls `term.dispose()` in cleanup - only removes from DOM
   - Requires `paneId` prop for pool lookup

3. **PaneId Consistency** (CRITICAL):
   - Single pane mode: `pane-single-${serverId}`
   - First split: MUST reuse same paneId for existing pane
   - New panes: `pane-${Date.now()}`
   - **Failure to maintain paneId consistency will cause content loss**

4. **Disposal Rules**:
   - Call `terminalPool.dispose(paneId)` ONLY when:
     - Closing a tab
     - Closing a pane
   - NEVER dispose during splits or component unmounts

**Why This Pattern?**

React's declarative lifecycle conflicts with xterm.js's imperative API. When split operations change component tree structure, React unmounts/remounts components, causing `term.dispose()` to be called and losing all content.

DOM Reparenting solves this by:
- Keeping xterm.js instances outside React's control
- Physically moving DOM nodes without destroying them
- React only manages placeholder divs, not actual terminals

**Reference Documentation**:
- `docs/troubleshooting/DOM-REPARENTING-FIX.md` - Detailed explanation
- `docs/troubleshooting/分屏问题总结.md` - Chinese summary
- VS Code terminal architecture (inspiration)

**Common Mistakes to Avoid**:
- ❌ Creating xterm instance in component useEffect
- ❌ Calling `term.dispose()` in component cleanup
- ❌ Using different paneIds for same terminal
- ❌ Managing terminal lifecycle with React state
- ✅ Always use terminalPool for instance management
- ✅ Use native DOM APIs for container attachment
- ✅ Maintain paneId consistency across splits

### Tauri IPC Commands

**Backend (src-tauri/src/commands.rs)**:
```rust
#[tauri::command]
async fn list_servers() -> Result<Vec<ServerConfig>, SshError> {
    // Implementation
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![list_servers])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Frontend**:
```typescript
const servers = await invoke<ServerConfig[]>('list_servers')
await invoke('save_server', { config: serverConfig })
```

---

## Backend Architecture

### Module Structure

```
src-tauri/src/
├── main.rs           # Tauri entry point
├── lib.rs            # Library exports
├── commands.rs       # Tauri IPC handlers
├── error.rs          # Error types (thiserror)
├── ssh/              # SSH connections (russh)
│   ├── mod.rs
│   ├── connection.rs
│   ├── handler.rs
│   ├── manager.rs
│   └── sftp.rs
├── config/           # SQLite storage (sqlx)
├── crypto/           # AES-256 encryption
├── monitor/          # System monitoring
└── snippets/         # Command snippets
```

### Error Handling Pattern

```rust
use thiserror::Error;

#[derive(Error, Debug)]
pub enum SshError {
    #[error("Connection failed: {0}")]
    ConnectionFailed(String),
    
    #[error("IO error")]
    Io(#[from] std::io::Error),
    
    #[error("Database error")]
    Database(#[from] sqlx::Error),
}

pub type Result<T> = std::result::Result<T, SshError>;

// Serialize for Tauri IPC
impl serde::Serialize for SshError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}
```

### Async Patterns

```rust
use tokio::sync::RwLock;  // Shared state
use tokio::sync::Mutex;   // Exclusive access
use async_trait::async_trait;

#[async_trait]
pub trait SshHandler {
    async fn connect(&self, config: &ServerConfig) -> Result<()>;
}

// Shared connection manager
pub struct ConnectionManager {
    connections: RwLock<HashMap<i32, SshConnection>>,
}
```

### Database (sqlx + SQLite)

```rust
use sqlx::{SqlitePool, Row};

pub struct ConfigManager {
    pool: SqlitePool,
}

impl ConfigManager {
    pub async fn new() -> Result<Self> {
        let pool = SqlitePool::connect("sqlite:app.db").await?;
        Ok(Self { pool })
    }
    
    pub async fn list_servers(&self) -> Result<Vec<ServerConfig>> {
        sqlx::query_as("SELECT * FROM servers")
            .fetch_all(&self.pool)
            .await
            .map_err(SshError::from)
    }
}
```

---

## Testing

### Running Tests

```bash
# All tests
cargo test

# Single test (exact match)
cargo test test_connection_success -- --exact

# Single test with output
cargo test test_connection_success -- --exact --nocapture

# Single thread (for flaky tests)
cargo test test_concurrent -- --test-threads=1

# Frontend tests (when implemented)
cd web && pnpm test
```

### Test Conventions

**Rust**:
```rust
#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    async fn test_connection_success() {
        let config = ServerConfig::test_config();
        assert!(connect(&config).await.is_ok());
    }
    
    #[tokio::test]
    async fn test_auth_failure() {
        let config = ServerConfig::wrong_password();
        let err = connect(&config).await.unwrap_err();
        assert!(matches!(err, SshError::AuthFailed(_)));
    }
}
```

---

## Troubleshooting

### Windows-Specific

**Linker errors (LNK1104, LNK1158)**:
1. Install Microsoft C++ Build Tools 2022
2. Install Windows SDK 10+
3. Restart terminal after installation
4. Alternative: Use WSL2

**Tauri build fails**:
```bash
# Clean build cache
cargo clean
rm -rf src-tauri/target
pnpm tauri dev
```

### Hot Reload Issues

**Frontend changes not reflecting**:
```bash
# Kill all node processes
taskkill /F /IM node.exe
# Restart dev server
pnpm tauri dev
```

**Backend changes not compiling**:
```bash
cargo check  # Fast check
cargo build  # Full rebuild if needed
```

### Common Errors

**"cannot find type in scope"**:
```rust
// Add missing import
use crate::error::Result;  // or std::result::Result
```

**"use of undeclared crate"**:
```toml
# Add to Cargo.toml [dependencies]
dependency-name = "version"
```

**TypeScript "Cannot find module"**:
```bash
cd web
pnpm install  # Reinstall dependencies
```

---

## Security & Implementation Status

### ✅ Completed Security Implementations

#### 1. Path Traversal Protection (✅ COMPLETED)
**Location**: `src-tauri/src/security/path_validation.rs`

**Implementation**:
- `validate_and_normalize_path()` - Validates and normalizes file paths
- `contains_traversal_pattern()` - Detects suspicious patterns (`..`, `\0`, etc.)
- Integrated into all SFTP commands: `sftp_read_file`, `sftp_write_file`, `sftp_list_dir`

**Protection**:
- ✅ Blocks `../` directory traversal attacks
- ✅ Blocks null byte injection (`\0`)
- ✅ Blocks mixed path attacks (e.g., `dir/../../etc/passwd`)
- ✅ 8 unit tests covering all edge cases

**Status**: ✅ **ACTIVE** - All SFTP operations now validate paths

---

#### 2. IPC Debouncing (✅ COMPLETED)
**Location**: `web/src/stores/ssh-store.ts`

**Implementation**:
- 5ms debounce window on terminal input
- Control characters (Ctrl+C, Ctrl+D, Ctrl+Z, Ctrl+\\) bypass buffer and sent immediately
- Maximum wait time: 5ms for normal input, 0ms for control characters

**Protection**:
- ✅ Prevents high-frequency backend calls
- ✅ Reduces SSH channel overload
- ✅ Maintains terminal responsiveness
- ✅ Control characters work instantly (Ctrl+C can interrupt commands)

**Status**: ✅ **ACTIVE** - All terminal input is debounced with control char bypass

---

#### 3. AES-256-GCM Encryption (✅ PRE-EXISTING)
**Location**: `src-tauri/src/crypto/mod.rs`

**Implementation**:
- All passwords/passphrases encrypted before SQLite storage
- Master key stored in Windows Credential Manager
- CryptoManager key zeroized on drop

**Status**: ✅ **ACTIVE** - Verified in codebase

---

### ⚠️ Known Issues

None currently.

---

### ✅ Recently Fixed Issues

#### Terminal Split Pane Content Loss (✅ FIXED - 2024-04-10)
**Problem**: When splitting terminal panes, the original terminal content was cleared due to React component lifecycle conflicts with xterm.js.

**Root Cause**: 
- React's declarative rendering conflicts with xterm.js's imperative API
- Component tree reorganization during split causes React to unmount/remount Terminal components
- xterm.js instances are disposed when components unmount, losing all content

**Solution**: DOM Reparenting pattern
- Created global `terminalPool` to manage xterm.js instances outside React lifecycle
- React components only provide placeholder divs
- Use native DOM API (`appendChild`/`removeChild`) to physically move terminal containers
- When React unmounts component, only placeholder is removed; xterm.js instance stays alive

**Files Modified**:
- `web/src/lib/terminalPool.ts` - Global terminal instance pool
- `web/src/components/Terminal.tsx` - Rewritten to use DOM Reparenting
- `web/src/components/TerminalArea.tsx` - Pass paneId prop
- `web/src/stores/ssh-store.ts` - Dispose terminals on tab/pane close

**Documentation**:
- `docs/troubleshooting/DOM-REPARENTING-FIX.md` - Detailed solution explanation
- `docs/troubleshooting/分屏问题总结.md` - Chinese summary

**Status**: ✅ **FIXED** - Split panes now preserve terminal content correctly

---

### ✅ Completed Bug Fixes

#### 1. Terminal Tab Switching Black Screen (✅ FIXED - 2024-03-23)
**Problem**: When switching between terminal tabs, terminal showed only blinking cursor with no content, even though SSH connection was active and data was being received.

**Root Cause**: 
- DOM renderer has asynchronous initialization
- Calling `fit()` or `refresh()` before renderer ready caused `Cannot read properties of undefined (reading 'dimensions')` error
- Terminal was being recreated on every tab switch due to incorrect useEffect dependencies

**Solution**:
1. Changed from Canvas renderer to DOM renderer (`rendererType: 'dom'`)
2. Added renderer initialization check - wait for `.xterm-rows` element before operations
3. Changed tab container from `display: none` to `visibility: hidden`
4. Added proper tab activation logic: write → delay → fit → refresh → scroll → focus
5. Removed `isActive` from terminal creation useEffect dependencies

**Files Modified**:
- `web/src/components/Terminal.tsx` - DOM renderer + initialization check + tab activation logic
- `web/src/App.tsx` - Tab container visibility styling

**Documentation**:
- `docs/troubleshooting/terminal-tab-switching.md` - Problem analysis
- `docs/troubleshooting/DOM-RENDERER-TIMING-ISSUE.md` - Root cause and fix details
- `docs/troubleshooting/TESTING-TAB-SWITCH-FIX.md` - Testing guide
- `docs/troubleshooting/HOW-TO-FORCE-REBUILD.md` - Rebuild instructions

**Status**: ✅ **FIXED** - Tab switching now works correctly, content appears immediately

---

#### 2. Ctrl+C Not Working (✅ FIXED - 2024-03-23)
**Problem**: Pressing Ctrl+C in terminal did not interrupt commands like `docker logs -f`. The command would hang, and only way to stop was to close tab and reconnect.

**Root Cause**: 
1. **PTY terminal modes not set**: SSH PTY request didn't set terminal modes, so server didn't know how to handle Ctrl+C
2. **Output buffer too small**: Backend output buffer was only 1024 messages, causing blocking when docker logs outputs rapidly
3. **Buffer full causes hang**: When buffer fills up, reader task blocks, SSH channel stops receiving data, docker logs stops outputting

**Solution**:
1. **Set minimal PTY terminal modes**:
   ```rust
   let terminal_modes = vec![
       (Pty::VINTR, 3),   // Ctrl+C = ASCII 3
       (Pty::VEOF, 4),    // Ctrl+D = ASCII 4
       (Pty::VSUSP, 26),  // Ctrl+Z = ASCII 26
       (Pty::ISIG, 1),    // Enable signals (CRITICAL)
   ];
   ```

2. **Increase output buffer**: From 1024 → 10240 (10x larger)

3. **Add blocking detection**: 5-second timeout with detailed logging

4. **Control characters bypass input buffer** (frontend):
   ```typescript
   if (CONTROL_CHARS.includes(data)) {
     // Send immediately without buffering
     invoke('ssh_send', { data: bufferedData + data });
   }
   ```

**Files Modified**:
- `src-tauri/src/ssh/handler.rs` - PTY modes, buffer size, blocking detection
- `web/src/stores/ssh-store.ts` - Control character immediate send

**Documentation**:
- `docs/troubleshooting/ctrl-c-not-working.md` - Problem analysis and fix details
- `docs/troubleshooting/TESTING-CTRL-C-FIX.md` - Testing guide

**Status**: ✅ **FIXED** - docker logs -f now works correctly, Ctrl+C interrupts immediately

---

#### 3. Terminal Size Mismatch and Line Wrapping Issues (✅ FIXED - 2024-04-10)
**Problem**: 
- When connecting to macOS SSH, extra `%` symbols appeared at line ends
- In vim, pressing arrow keys caused cursor to jump lines incorrectly
- Long input lines would wrap to the beginning of the current line instead of the next line
- Input characters would overwrite each other at the line start

**Root Cause**: 
1. **Hardcoded PTY size**: SSH PTY initialization used hardcoded `120×40`, but frontend terminal was actually `155×39` or other sizes
2. **No dynamic resize**: After converting Channel to stream with `into_stream()`, the `window_change` method was no longer accessible
3. **Size mismatch**: Shell (bash/zsh) thought line width was 120 chars, but display was 155 chars, causing incorrect line wrapping

**Solution**:
1. **Changed PTY initialization**: From hardcoded `120×40` to reasonable default `120×30`
2. **Implemented true dynamic resize**:
   - Refactored `SshChannelHandler` to keep Channel object instead of converting to stream
   - Used `tokio::select!` to handle both I/O and resize messages
   - Implemented `channel.window_change(cols, rows, 0, 0)` for proper PTY resize
3. **Frontend sends actual size**: Terminal component sends real dimensions (e.g., `155×39`) immediately after creation

**Technical Details**:
```rust
// Before: Channel converted to stream, lost window_change capability
let stream = channel.into_stream();
let (read_half, write_half) = tokio::io::split(stream);

// After: Keep Channel object, handle I/O manually
tokio::select! {
    msg = channel_rx.recv() => {
        match msg {
            Some(ChannelMessage::Resize { cols, rows }) => {
                channel.window_change(cols, rows, 0, 0).await?;
            }
            // ... handle data
        }
    }
    msg = channel.wait() => {
        // ... handle incoming data
    }
}
```

**Files Modified**:
- `src-tauri/src/ssh/handler.rs` - Refactored to keep Channel object, implement window_change
- `src-tauri/src/ssh/connection.rs` - Updated resize method to call handler
- `src-tauri/src/ssh/manager.rs` - Changed default PTY size to 120×30
- `web/src/components/Terminal.tsx` - Added DOM renderer readiness checks
- `web/src/components/TerminalArea.tsx` - Ensured resize is called after terminal creation

**Status**: ✅ **FIXED** - Terminal now resizes correctly, line wrapping works as expected

**Follow-up Fix (2026-04-11)**: Even with dynamic resize, macOS occasionally showed `%` symbol on first line due to timing issue. See next section for complete solution.

---

#### 3.1. Terminal Size Initialization Optimization (✅ FIXED - 2026-04-11)
**Problem**: 
- Even with dynamic resize implemented, macOS still occasionally showed `%` symbol on first line after connection
- This was a timing issue: PTY initialized with default size (120×30) before frontend could send actual size

**Root Cause**:
- Backend used hardcoded default size during connection
- Frontend sent actual size via `ssh_resize` AFTER connection established
- Shell initialized with wrong dimensions before resize event arrived

**Solution**: Pass terminal dimensions during initial connection
1. **Backend accepts dimensions**: Modified `ConnectionManager::create_connection()` to accept optional `cols` and `rows` parameters
2. **Frontend provides dimensions**: Modified `ssh-store.ts` to get terminal dimensions from `terminalPool` and pass them to `ssh_connect`
3. **Command interface updated**: `ssh_connect` command now accepts optional `cols` and `rows` parameters

**Implementation**:
```rust
// Backend: src-tauri/src/ssh/manager.rs
pub async fn create_connection(
    &self,
    id: &str,
    config: ServerConfig,
    cols: Option<u32>,  // NEW: Optional terminal columns
    rows: Option<u32>,  // NEW: Optional terminal rows
    app_handle: tauri::AppHandle,
) -> Result<()> {
    let cols = cols.unwrap_or(120);  // Use provided or default
    let rows = rows.unwrap_or(30);
    conn.connect_with_shell(cols, rows).await?;
}
```

```typescript
// Frontend: web/src/stores/ssh-store.ts
const paneId = `pane-single-${serverId}`;
const termInstance = terminalPool.get(paneId);
const cols = termInstance?.term.cols;  // Get actual width
const rows = termInstance?.term.rows;  // Get actual height

await invoke('ssh_connect', { 
  tabId: `conn-${serverId}`, 
  config: server,
  cols,  // Pass actual dimensions
  rows
});
```

**Files Modified**:
- `src-tauri/src/commands/ssh.rs` - Added cols/rows parameters to ssh_connect
- `src-tauri/src/ssh/manager.rs` - Modified create_connection to accept and use dimensions
- `web/src/stores/ssh-store.ts` - Pass terminal dimensions in connectServer(), splitPane(), and reconnectServer()

**Benefits**:
- Eliminates % symbol completely - PTY initialized with correct size from the start
- No resize race condition - no need to wait for ssh_resize after connection
- Better vim experience - arrow keys work correctly immediately
- Proper line wrapping - long lines wrap at correct positions

**Status**: ✅ **FIXED** - Terminal dimensions now passed from frontend to backend during initial connection

---

#### 4. Arrow Key History Navigation Issues (✅ FIXED - 2024-04-10)
**Problem**: 
- Pressing up/down arrow keys to browse command history caused garbled output
- Lines would break unexpectedly
- System beep sound occurred
- Affected both local terminal and remote SSH tabs

**Root Cause**: 
- Frontend intercepted arrow keys (`keyCode 38/40`) and sent custom sequences (`\x15 + command`)
- This conflicted with shell's built-in history navigation (bash/zsh handle `\x1b[A` / `\x1b[B` natively)
- Double processing caused garbled output and unexpected behavior

**Solution**:
1. **Removed frontend arrow key interception**: Deleted `domEvent.preventDefault()` and custom history logic from `Terminal.tsx`
2. **Let shell handle history**: Arrow keys now pass through to shell as standard escape sequences
3. **Kept history saving**: Frontend still saves command history locally for other features, but doesn't interfere with navigation

**Files Modified**:
- `web/src/components/Terminal.tsx` - Removed arrow key interception in `onKey` handler
- Simplified `onData` handler to skip escape sequences when tracking current command

**Status**: ✅ **FIXED** - Arrow keys now work correctly for command history navigation

---

#### 5. Split Pane Clears Terminal Content (✅ FIXED - 2024-04-10)
**Problem**: When splitting terminal panes using keyboard shortcuts (Ctrl+Shift+D/E), the original terminal content was cleared, showing only blank screen with cursor.

**Root Cause**: 
- React's declarative lifecycle conflicts with xterm.js's imperative API
- When split operations change component tree structure (wrapping in `<SplitPane>`), React unmounts/remounts Terminal components
- React's `key` only works for same-level siblings; when parent changes, component is unmounted
- xterm.js `dispose()` is called during unmount, destroying terminal buffer and all content

**Solution**: **DOM Reparenting Pattern** (inspired by VS Code)
1. **Global Terminal Pool** (`web/src/lib/terminalPool.ts`):
   - Manages all xterm.js instances and DOM containers OUTSIDE React lifecycle
   - Instances created once and reused forever
   - Only disposed when tab is closed, NEVER during splits

2. **Terminal Component Rewrite** (`web/src/components/Terminal.tsx`):
   - Component only provides placeholder `<div>` (NOT actual terminal container)
   - Uses native DOM API (`appendChild`/`removeChild`) to attach/detach containers
   - When React unmounts: only placeholder removed, xterm.js instance stays alive
   - When React mounts: same terminal container attached to new placeholder

3. **PaneId Consistency** (CRITICAL FIX):
   - Single pane mode: `pane-single-${serverId}`
   - First split: MUST reuse same paneId for existing pane
   - Bug was: first split created new paneId, causing pool miss and content loss
   - Fix: `const existingPaneId = \`pane-single-${tab.serverId}\``

**Technical Details**:
```typescript
// Terminal Pool manages instances outside React
class TerminalPool {
  getOrCreate(paneId: string): TerminalInstance {
    // Create once, reuse forever
  }
  dispose(paneId: string): void {
    // Only called when closing tab/pane
  }
}

// Terminal component uses DOM Reparenting
useEffect(() => {
  const instance = terminalPool.getOrCreate(paneId);
  placeholderRef.current.appendChild(instance.container); // Native DOM API
  
  return () => {
    placeholderRef.current.removeChild(instance.container); // NOT dispose!
  };
}, [paneId]);
```

**Files Modified**:
- `web/src/lib/terminalPool.ts` - Global terminal pool (NEW)
- `web/src/components/Terminal.tsx` - Complete rewrite using DOM Reparenting
- `web/src/components/TerminalArea.tsx` - Pass paneId prop
- `web/src/stores/ssh-store.ts` - Fix paneId consistency + add dispose calls

**Documentation**:
- `docs/troubleshooting/DOM-REPARENTING-FIX.md` - Detailed technical explanation
- `docs/troubleshooting/分屏问题总结.md` - Chinese summary
- `docs/troubleshooting/修复总结-DOM-Reparenting.md` - Quick reference

**Status**: ✅ **FIXED** - Split panes now preserve terminal content perfectly

**IMPORTANT**: See "CRITICAL: Terminal Component Architecture" section in Frontend Architecture for development guidelines.

---

### ⏳ Pending Security Tasks

#### 1. Cargo Audit (📝 MANUAL STEP REQUIRED)
**Command**:
```bash
cargo install cargo-audit
cd src-tauri
cargo audit
```

**Purpose**: Scan dependencies for known vulnerabilities

**Status**: ⏳ **PENDING** - Requires manual installation

---

#### 2. CSP Configuration (⚠️ LOW PRIORITY)
**Current**: CSP disabled (`csp: null` in `tauri.conf.json`)

**Risk**: 🟡 LOW - App uses only local resources

**Action**: Configure before adding external resources

---

- [x] **IPC calls debounced** - ✅ IMPLEMENTED (50ms window)

---

## Security Audit Results (2026-03-11)

### Audit Summary
- **Total vulnerabilities found**: 1
- **Risk level**: 🟡 LOW (local use only)
- **Package affected**: `rsa v0.9.10`

### Vulnerability Details

**Advisory**: RUSTSEC-2023-0071 (Marvin Attack)
**Package**: `rsa v0.9.10`
**Title**: Potential key recovery through timing sidechannels
**CVSS**: 5.9 (AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:N/A:N)

**Impact**: 
- Timing sidechannel vulnerability in RSA implementation
- Risk: Information leakage through network-observable timing

**Affected Use Case**:
- `rsa` crate is used via `russh` for SSH key signing operations
- **Our usage**: Local SSH client - key operations happen locally only

**Risk Assessment**:
- 🟡 **LOW** for our use case
- The vulnerability is primarily a concern for **server-side** RSA signing
| Our app is an SSH **client** that performs local operations only
- No network-exposed timing endpoints

**Recommendation**:
- Postpone until `russh` migrates to constant-time RSA implementation
- Current workaround: Local use on non-compromised computers is fine
- Monitor: https://github.com/RustCrypto/RSA/issues/19

---

## Performance Checklist

- [ ] App cold start < 1.5s
- [ ] Memory per SSH session < 80MB
- [ ] Terminal input latency < 50ms
- [x] Use `RwLock` for read-heavy shared state (Actor model used instead)
- [ ] Batch database writes when possible (deferred - no bulk import need)
- [x] **Debounce rapid IPC calls from frontend** - ✅ IMPLEMENTED
