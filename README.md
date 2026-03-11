# HetaoSSH

<div align="center">

**Modern SSH Client built with Tauri 2.0**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Rust](https://img.shields.io/badge/rust-1.75+-orange.svg)](https://www.rust-lang.org)
[![Tauri](https://img.shields.io/badge/tauri-2.0-24C8CE.svg)](https://tauri.app)

![HetaoSSH Preview](docs/preview.png)

</div>

## ✨ Features

- 🔐 **Secure Connection Management** - AES-256 encrypted storage for passwords and keys
- 🖥️ **Multi-tab Terminal** - Manage multiple SSH sessions simultaneously
- ⚡ **High-Performance Terminal** - xterm.js with WebGL acceleration
- 📁 **Remote File Browser** - SFTP file management
- 📝 **Code Editor** - Monaco Editor (VS Code kernel) with syntax highlighting
- 📊 **System Monitoring** - Real-time CPU, Memory, Disk, and Network monitoring
- 🎯 **Command Snippets** - Quick execution of common commands

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  Server  │  │ Terminal │  │   File   │  │  System  │   │
│  │   List   │  │  (xterm) │  │  Browser │  │  Monitor │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│            React + TypeScript + Tailwind CSS               │
└─────────────────────────────────────────────────────────────┘
                              │
                    Tauri IPC Bridge
                              │
┌─────────────────────────────────────────────────────────────┐
│                          Backend                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │   SSH    │  │   SFTP   │  │  SQLite  │  │  Crypto  │   │
│  │ (russh)  │  │          │  │  (sqlx)  │  │(AES-256) │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│                      Rust + Tokio                          │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- [Rust](https://www.rust-lang.org/tools/install) (1.75+)
- [Node.js](https://nodejs.org/) (18+)
- [pnpm](https://pnpm.io/installation)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/hetaossh.git
cd hetaossh

# Install dependencies
pnpm install

# Start development server
pnpm tauri dev

# Build for production
pnpm tauri build
```

## 📖 Documentation

- [User Guide](docs/USER_GUIDE.md) - How to use HetaoSSH
- [API Documentation](docs/API.md) - Tauri commands and data structures
- [Development Guidelines](AGENTS.md) - Code style and build commands

## 🎯 Project Structure

```
HetaoSSH/
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── ssh/           # SSH connection (russh)
│   │   ├── config/        # SQLite storage (sqlx)
│   │   ├── crypto/        # AES-256 encryption
│   │   ├── monitor/       # System monitoring (sysinfo)
│   │   ├── snippets/      # Command snippets
│   │   └── commands.rs    # Tauri commands
│   └── Cargo.toml
├── web/                    # React frontend
│   ├── src/
│   │   ├── components/    # UI components
│   │   ├── stores/        # Zustand state management
│   │   ├── types/         # TypeScript types
│   │   └── App.tsx
│   └── package.json
├── docs/                   # Documentation
│   ├── USER_GUIDE.md
│   ├── API.md
│   └── PRD.md
└── AGENTS.md              # Development guidelines
```

## 🛠️ Tech Stack

### Backend (Rust)
- **russh** - SSH client/server library
- **sqlx** - Async SQL database (SQLite)
- **aes-gcm** - AES-256-GCM encryption
- **sysinfo** - System information
- **tokio** - Async runtime
- **zeroize** - Secure memory clearing

### Frontend (TypeScript)
- **React 18** - UI framework
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **xterm.js** - Terminal emulator
- **Monaco Editor** - Code editor
- **Zustand** - State management

## 📋 Features Detail

### Connection Security
- All passwords and private keys are encrypted with AES-256-GCM before storage
- Encryption key is generated on each app startup
- Sensitive data is cleared from memory after use

### Terminal Features
- WebGL-accelerated rendering
- 24-bit true color support
- Scrollback buffer (10,000 lines)
- Customizable themes
- Auto-resize on window change

### File Editor
- Syntax highlighting for 20+ languages
- Auto-detection based on file extension
- Save with Ctrl+S
- Word wrap and minimap options

### System Monitoring
- Real-time CPU usage percentage
- Memory usage with total/used/available
- Network traffic (RX/TX)
- Disk usage per mount point

### Command Snippets
- Pre-loaded with common commands
- Categorized for easy access
- One-click copy to clipboard
- Custom snippets support

## 🎨 Screenshots

### Terminal View
![Terminal](docs/terminal.png)

### File Browser
![Files](docs/files.png)

### System Monitor
![Monitor](docs/monitor.png)

## 📊 Performance Targets

- **Cold Start**: < 1.5s
- **Memory per Session**: < 80MB
- **Input Latency**: < 50ms

## 🔒 Security

- AES-256-GCM encryption for sensitive data
- Zeroize crate for secure memory clearing
- Input validation for all user inputs
- No external network calls except SSH

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) first.

### Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feat/amazing-feature`)
5. Open a Pull Request

### Commit Message Format

```
<type>(<scope>): <subject>
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`

**Example:** `feat(ssh): add Ed25519 key authentication support`

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Tauri](https://tauri.app) - Build smaller, faster, and more secure desktop applications
- [russh](https://github.com/warp-tech/russh) - Rust SSH library
- [xterm.js](https://xtermjs.org) - Terminal emulator for the web
- [Monaco Editor](https://microsoft.github.io/monaco-editor) - Code editor that powers VS Code

## 📬 Contact

- **GitHub Issues**: [Report bugs or request features](https://github.com/your-org/hetaossh/issues)
- **Discussions**: [Ask questions and share ideas](https://github.com/your-org/hetaossh/discussions)
- **Email**: support@example.com

---

<div align="center">

**Made with ❤️ using Rust and React**

⭐ Star this repo if you find it helpful!

</div>
