# AGENTS.md - HetaoSSH Development Guidelines

## Project Overview

**HetaoSSH** - Modern SSH client built with Tauri 2.0
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
HetaoSSH/
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

**Linker error**: Install Microsoft C++ Build Tools (Windows) or use WSL2

**Tauri not hot-reloading**: Kill all node processes, restart `pnpm tauri dev`

**Clippy warnings in tests**: Use `#[allow(clippy::unwrap_used)]`
