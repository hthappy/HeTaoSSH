# HeTaoSSH

<div align="center">

**Modern SSH Client built with Tauri 2.0**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Rust](https://img.shields.io/badge/rust-1.75+-orange.svg)](https://www.rust-lang.org)
[![Tauri](https://img.shields.io/badge/tauri-2.0-24C8CE.svg)](https://tauri.app)

[English](README.md) | [简体中文](README_zh.md)

![HeTaoSSH Preview](docs/preview.png)

</div>

## ✨ Features

- 🔐 **Secure Connection Management** - AES-256 encrypted storage for passwords and keys
- 🖥️ **Multi-tab Terminal** - Manage multiple SSH sessions simultaneously
- ⚡ **High-Performance Terminal** - xterm.js with WebGL acceleration
- 💻 **Local Terminal** - Integrated local shell support (PowerShell/Bash)
- 📁 **Remote File Browser** - SFTP file management with drag-and-drop upload
- 📝 **Code Editor** - Monaco Editor (VS Code kernel) with syntax highlighting
- 📊 **System Monitoring** - Real-time CPU, Memory, Disk, and Network monitoring
- 🎯 **Command Snippets** - Quick execution of common commands
- 🔄 **Auto Update** - Seamless updates via GitHub Releases
- 🎨 **Theming** - Customizable themes and appearance

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
git clone https://github.com/hthappy/HeTaoSSH.git
cd HeTaoSSH

# Install dependencies
pnpm install

# Start development server
pnpm tauri dev

# Build for production
pnpm tauri build
```


## 📖 Documentation

- [User Guide](docs/USER_GUIDE.md) - How to use HeTaoSSH
- [API Documentation](docs/API.md) - Tauri commands and data structures
- [Development Guidelines](AGENTS.md) - Code style and build commands

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
