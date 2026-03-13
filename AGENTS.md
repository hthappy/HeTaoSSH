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
- 50ms debounce window on `sendToTerminal()` calls
- Maximum wait time: 150ms
- Uses `lodash-es` debounce function

**Protection**:
- ✅ Prevents high-frequency backend calls
- ✅ Reduces SSH channel overload
- ✅ Maintains terminal responsiveness

**Status**: ✅ **ACTIVE** - All terminal input is debounced

---

#### 3. AES-256-GCM Encryption (✅ PRE-EXISTING)
**Location**: `src-tauri/src/crypto/mod.rs`

**Implementation**:
- All passwords/passphrases encrypted before SQLite storage
- Master key stored in Windows Credential Manager
- CryptoManager key zeroized on drop

**Status**: ✅ **ACTIVE** - Verified in codebase

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
