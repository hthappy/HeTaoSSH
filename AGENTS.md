# AGENTS.md - HeTaoSSH Development Guidelines

## Project Overview

**HeTaoSSH** - Modern SSH client built with Tauri 2.0
- **Backend**: Rust (`russh` 0.50 for SSH, `russh-sftp` 2.1, `sqlx` + `SQLite` for storage)
- **Frontend**: React + TypeScript + Tailwind CSS
- **Terminal**: xterm.js managed through a DOM-reparenting terminal pool
- **Editor**: Monaco Editor (VS Code kernel)
- **i18n**: react-i18next (zh/en locales)
- **Portability**: Windows (MSVC toolchain), local terminal via portable-pty

---

## Build & Development Commands

### Prerequisites
```bash
# Windows: Rust toolchain (includes cargo) + MSVC linker
winget install Rustlang.Rustup
winget install Microsoft.VisualStudio.2022.BuildTools --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"

# macOS/Linux: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

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
pnpm exec tsc --noEmit  # Type-check frontend without emitting files
pnpm build           # Type-check and create the Vite production bundle
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

**Async**: tokio runtime; Actor model per SSH connection (mpsc command channel), `Mutex` only for short-lived handle map access

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
├── src-tauri/             # Rust backend + Tauri config
│   ├── src/
│   │   ├── commands/      # Tauri IPC handlers (config/sftp/ssh/system/tunnel)
│   │   ├── ssh/           # SSH connections (russh)
│   │   ├── config/        # Configuration + SQLite storage
│   │   ├── crypto/        # AES-256 encryption
│   │   └── security/      # Path traversal protection
│   └── tauri.conf.json
├── web/src/               # Frontend (React + TypeScript)
│   ├── components/
│   ├── stores/            # zustand (ssh-store, shortcuts-store)
│   ├── hooks/
│   ├── i18n/locales/      # zh.ts / en.ts
│   ├── lib/               # terminalPool, commandHistory, utils
│   ├── constants/         # IPC timing constants
│   ├── themes/
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

### Terminal, SFTP, and Transfer UX Rules

1. **Remote terminal drag-and-drop uses the SFTP destination, never a parsed shell prompt.**
   - `FileDropListener` in `web/src/App.tsx` handles OS-level drops while a remote connection is active.
   - It must use `getSftpPath(serverId)` as the destination; when no SFTP path has been selected, resolve and store the remote home directory first.
   - Do not infer a destination from terminal output or a prompt such as `/data/product`; prompts are customizable and may not represent the shell's real current directory.
   - Before invoking `sftp_upload_file_with_progress`, switch to the SFTP activity so `FileTree` can show its inline progress.
   - Dropped folders are uploaded recursively via `sftp_upload_dir_with_progress` (check with `local_is_dir`); dropped files on a local terminal open in the editor instead.

2. **Use progress events for transfers, not per-file Toast spam.**
   - `sftp-upload-progress` powers both the SFTP inline progress section and the global `TransferProgress` overlay.
   - Keep a completed transfer visible briefly with its complete filename, then refresh the target directory.
   - Reserve Toast notifications for actionable failures and exceptional cases.

3. **Do not force scrollback to the bottom during a resize.**
   - In `Terminal.tsx`, only follow output if the viewport was already at the bottom before fitting.
   - Preserve active-pane focus when actions originate outside the terminal (for example, executing a snippet).

4. **Workspace tabs and dirty files.**
   - File dirty state is stored in `ssh-store.ts`; use `requestCloseTab` in `App.tsx` for user-initiated closes so unsaved edits are confirmed.
   - `reorderTabs` only changes visual tab order. It must not recreate terminal panes or dispose pooled terminal instances.

5. **Disconnected terminal must offer a way back.**
   - When `disconnected` is set in `Terminal.tsx`, any key press must call `handleTerminalKeyPress(serverId)` to trigger reconnect — never leave the terminal as a dead end.
   - Error states (connection failed, file load failed, dir load failed, server list failed) render a retry button (`common.retry`).

6. **Local terminal shell selection.**
   - `local_term.rs` detects available shells (PowerShell/pwsh/cmd/Git Bash); `list_local_shells` feeds the tab-bar split button, and `open_local_terminal` takes an optional `shell` parameter persisted as the user's default.
   - Split panes inherit the source pane's shell.

7. **i18n coverage.**
   - All user-facing strings go through `t()` with keys in both `web/src/i18n/locales/zh.ts` and `en.ts`; the two files must stay key-symmetric.

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
├── commands/         # Tauri IPC handlers
│   ├── mod.rs
│   ├── config.rs     # Server config CRUD
│   ├── sftp.rs       # SFTP operations (upload/download, file + recursive dir)
│   ├── ssh.rs        # SSH connect/send/resize
│   ├── system.rs     # Local terminal shells, system info
│   └── tunnel.rs     # Port forwarding
├── error.rs          # Error types (thiserror)
├── ssh/              # SSH connections (russh 0.50)
│   ├── mod.rs
│   ├── connection.rs # Single connection state, reconnect
│   ├── handler.rs    # Channel I/O, PTY modes, window_change
│   ├── manager.rs    # Actor-model connection manager + SFTP handlers
│   ├── sftp.rs       # SFTP session helpers
│   └── tunnel.rs     # Local/SOCKS forwarding
├── config/           # SQLite storage (sqlx)
├── crypto/           # AES-256 encryption
├── monitor.rs        # Remote system monitoring
├── local_term.rs     # Local terminal (portable-pty, shell detection)
├── snippets.rs       # Command snippets storage
├── theme.rs          # Theme import (.json/.itermcolors)
├── security/         # Path traversal validation
└── window_state.rs   # Window size/position persistence
```

### Connection Reliability (Actor + Watchdog)

Each SSH connection runs in a dedicated tokio task (Actor) processing commands
from an mpsc channel. Key invariants in `ssh/manager.rs`:

- **Never await the network without a timeout.** Quick commands (send/recv,
  resize, latency, monitor, small SFTP ops) run under `QUICK_CMD_TIMEOUT`
  (30s — must exceed GetSystemUsage's internal worst case ~15s). Channel
  writes/ctrl ops in `handler.rs` have their own shorter timeouts. On timeout
  the connection is declared dead: the actor emits `ssh-disconnected` and
  enters `wait_for_reconnect`, rejecting queued commands with
  `reply_connection_lost` (every `ConnCommand` variant must be handled there).
- **Large transfers are exempt from the watchdog** (download/upload file/dir);
  a dead connection surfaces via russh keepalive errors instead.
- **Never hold the `handles` Mutex across a blocking send.** Management
  operations remove the handle from the map first, then `try_send`.
- **Terminal output is batched** (`MAX_EMIT_BATCH_BYTES = 64KB`) before
  emitting to the frontend to survive output floods like `tail -f`.

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

The connection manager uses the **Actor model**: one tokio task per connection,
an mpsc command channel (`ConnCommand`), and a short-held `Mutex<HashMap>`
only for handle lookup/insert — no `RwLock` around live connections.

```rust
use tokio::sync::{mpsc, oneshot, Mutex};

// Command dispatch with reply channel
let (reply_tx, reply_rx) = oneshot::channel();
tx.send(ConnCommand::SftpListDir { path, reply: reply_tx }).await?;
let entries = reply_rx.await??;
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
**Location**: `web/src/stores/ssh-store.ts` + `web/src/constants/ipc.ts`

**Implementation**:
- 5ms debounce window (`IPC_DEBOUNCE_MS`), 150ms max wait (`IPC_MAX_WAIT_MS`)
- Control characters (Ctrl+C, Ctrl+D, Ctrl+Z, Ctrl+\\) bypass buffer and sent immediately

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

### 📚 Historical Bug Fixes

Detailed root-cause analyses of past fixes live in `docs/troubleshooting/` and
`CHANGELOG.md`. The architectural lessons that still constrain new code are
kept in this file (see "CRITICAL: Terminal Component Architecture",
"Connection Reliability", and "Terminal, SFTP, and Transfer UX Rules").

---

### ⏳ Pending Security Tasks

#### 1. CSP Configuration (⚠️ LOW PRIORITY)
**Current**: CSP disabled (`csp: null` in `tauri.conf.json`)

**Risk**: 🟡 LOW - App uses only local resources

**Action**: Configure before adding external resources

---

- [x] **IPC calls debounced** - ✅ IMPLEMENTED (5ms window, 150ms max wait)

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
- [x] Actor model per connection (no `RwLock` around live connections)
- [ ] Batch database writes when possible (deferred - no bulk import need)
- [x] **Debounce rapid IPC calls from frontend** - ✅ IMPLEMENTED (5ms window)
- [x] **Batch terminal output emits** - ✅ IMPLEMENTED (64KB aggregation)
