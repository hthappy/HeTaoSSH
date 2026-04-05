# HeTaoSSH v1.1.10

A lightweight, modern SSH client built with Tauri 2.0 + Rust + React. Faster startup than VS Code Remote, cleaner UI than traditional terminals.

---

## 🐛 Bug Fixes

### Terminal History Navigation Fixed
- **Arrow keys no longer cause garbled output or line breaks** when browsing command history
- Removed conflicting frontend history interception — shell (bash/zsh) now handles `↑`/`↓` natively as intended
- Fixed the beeping sound that occurred when pressing arrow keys in both remote SSH and local terminal tabs

### Terminal Search
- Fixed search showing "no matches" even when matches exist (wrong xterm.js API name)
- Match count now displays correctly (e.g. `1/5`)
- All matches highlighted in yellow, current match in orange
- Highlights clear automatically when closing the search bar

---

## ✨ Previous Highlights (v1.1.x)

- **Tab switching** — no more black screen when switching between terminal tabs
- **`docker logs -f` Ctrl+C** — fixed; commands can now be interrupted reliably
- **Scrollback buffer** increased from 10K → 100K lines
- **Code snippet execution** — auto-focuses terminal after sending a command
- **Connection error messages** — now shows detailed auth failure info

---

## 📦 Installation

**Windows** — download the `.msi` or `.exe` installer below.

**Build from source:**
```bash
git clone https://github.com/hthappy/HeTaoSSH.git
cd HeTaoSSH
pnpm install
pnpm tauri build
```

---

## 🔄 Auto Update

If you have a previous version installed, the app will prompt you to update automatically.
