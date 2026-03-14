# Changelog

All notable changes to this project will be documented in this file.

### 🚀 Features (新增功能)
- **Server Management**: Refactored the Add/Edit Server dialog to consolidate authentication methods. Added a dropdown to switch between Password and Private Key authentication, making the interface cleaner and more intuitive.
- **Key File Selection**: Added a file browser button in the Add Server dialog to easily select local SSH private key files (e.g., `id_rsa`, `id_ed25519`) without manually typing the path.
- **Code Snippets Tooltip**: Added an interactive tooltip to the Code Snippets list. Hovering over a snippet now displays its full details (name, description, and command) in a well-positioned floating card.

### 🐛 Bug Fixes (问题修复)
- **Tooltip Layout**: Fixed an issue where the Code Snippet tooltip was obscured by the parent container's overflow settings or disrupted the layout of other snippets. The tooltip now uses fixed positioning to ensure it's always visible.
- **Build Errors**: Resolved TypeScript compilation errors caused by unused variables (`FileType` and `encoding`) in the `StatusBar` component, ensuring the CI/CD pipeline and local builds succeed.

### 🌍 Internationalization (多语言支持)
- **Authentication Methods**: Added new localization keys for the new authentication dropdown options and the key file browse button in both English and Chinese language packs.