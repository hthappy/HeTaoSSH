# Windows 安装包发布修复说明

## 当前发布架构

### 混合发布模式

本项目采用**混合发布模式**：

| 平台 | 发布方式 | 自动更新 | 负责方 |
|------|----------|----------|--------|
| **Windows** | 本地脚本发布 | ✅ 支持 (NSIS) | 开发者本地执行 |
| **macOS** | GitHub Actions | ❌ 不支持 (DMG) | CI 自动构建 |

**工作流程**：
```
开发者本地                          GitHub Actions
    |                                    |
    |-- push tag v0.5.1 ---------------->|
    |                                    |
    |-- 运行 release_pipeline.js ------->|
    |    - 构建 Windows                   |
    |    - 签名                           |
    |    - 上传 .exe, .msi, latest.json  |
    |                                    |
    |    <-------- 触发 CI ---------------|
    |                                    |
    |                         构建 macOS |
    |                         上传 .dmg  |
    |                                    |
    |                         Release 完成 |
```

## 已完成的修复

### 1. 改进资产查找逻辑 (`scripts/release_pipeline.js`)

**修改前**：
```javascript
function findAsset(dir, filterFn) {
  const files = fs.readdirSync(dir);
  const found = files.find(filterFn);  // 只找第一个
  return found ? path.join(dir, found) : null;
}
```

**修改后**：
```javascript
function findAssets(dir, filterFn) {
  const files = fs.readdirSync(dir);
  return files.filter(filterFn).map(f => path.join(dir, f));  // 找所有匹配的
}

// 查找所有 MSI 文件
const msiFiles = findAssets(bundleDir, f => 
  f.includes(version) && f.endsWith('.msi') && !f.includes('_en-US') && !f.endsWith('.msi.sig')
);

// 查找所有 EXE 文件
const exeFiles = findAssets(nsisDir, f => 
  f.includes(version) && f.endsWith('.exe') && !f.includes('_en-US') && !f.endsWith('.exe.sig')
);
```

**优势**：
- ✅ 支持多个安装包同时上传
- ✅ 逐个上传，失败可继续
- ✅ 详细的日志输出

### 2. 改进错误提示 (`scripts/generate_updater_json.js`)

**新增功能**：
- 检查 unsigned 安装包
- 列出目录内容以便调试
- 提供可能的原因和解决方案

### 3. 更新发布说明模板

**新增内容**：
- 明确说明两种 Windows 安装包的用途
- 提供企业部署指南（MSI 静默安装）
- 中英双语说明

### 4. 创建测试脚本 (`scripts/test_assets.js`)

用于验证构建输出和版本匹配。

## 使用指南

### 完整发布流程

```bash
# 1. 清理旧的构建文件（可选）
rm -rf src-tauri/target/release/bundle/msi/*.msi
rm -rf src-tauri/target/release/bundle/nsis/*.exe

# 2. 检查当前版本
cat package.json | grep version

# 3. 运行测试脚本验证
node scripts/test_assets.js

# 4. 如果没有构建文件，先构建
node scripts/build_with_signing.js

# 5. 发布（会自动 bump version）
node scripts/release_pipeline.js minor  # 或 patch/major
```

### 版本管理

```bash
# Patch: 0.5.0 -> 0.5.1
node scripts/release_pipeline.js patch

# Minor: 0.5.0 -> 0.6.0
node scripts/release_pipeline.js minor

# Major: 0.5.0 -> 1.0.0
node scripts/release_pipeline.js major
```

### 手动上传（如自动上传失败）

```bash
# 1. 找到构建文件
ls src-tauri/target/release/bundle/msi/
ls src-tauri/target/release/bundle/nsis/

# 2. 手动创建 release
gh release create v0.5.0 --title "HeTaoSSH v0.5.0" -F release_notes.md

# 3. 上传所有文件
gh release upload v0.5.0 \
  src-tauri/target/release/bundle/msi/HeTaoSSH_0.5.0_x64.msi \
  src-tauri/target/release/bundle/nsis/HeTaoSSH_0.5.0_x64-setup.exe \
  latest.json \
  --clobber
```

## 文件说明

### Windows 安装包

| 文件 | 用途 | 自动更新 |
|------|------|----------|
| `*_setup.exe` | 标准安装包（推荐普通用户使用） | ✅ 支持 |
| `*.msi` | 企业安装包（支持静默部署） | ❌ 不支持 |

### MSI 静默安装命令

```bash
# 静默安装
msiexec /i HeTaoSSH_0.5.0_x64.msi /quiet

# 带日志的静默安装
msiexec /i HeTaoSSH_0.5.0_x64.msi /quiet /log install.log

# 卸载
msiexec /x HeTaoSSH_0.5.0_x64.msi /quiet
```

## 常见问题

### Q1: 提示 "Release.tag_name already exists"
**A**: 该版本已发布，需要：
```bash
# 删除旧 release（仅测试环境）
gh release delete v0.5.0 --cleanup-tag --yes

# 或使用新版本号
node scripts/release_pipeline.js minor --version 0.6.0
```

### Q2: 提示 "No signatures found"
**A**: 签名失败，检查：
1. `scripts/tauri.key.txt` 是否存在
2. 密钥密码是否正确
3. 查看构建日志中的签名错误

### Q3: 上传失败 "HTTP 422"
**A**: 可能原因：
- Release 不存在 → 先创建 release
- 文件已存在 → 使用 `--clobber` 参数
- 文件大小超限 → GitHub Releases 限制 2GB

## 验证清单

发布完成后，检查：

- [ ] GitHub Releases 中有 .exe 文件
- [ ] GitHub Releases 中有 .msi 文件
- [ ] latest.json 已上传
- [ ] latest.json 内容正确（包含 signature 和 url）
- [ ] Release Notes 包含安装说明

## 下一步

如果 macOS 版本也需要发布：
1. macOS 由 GitHub Actions 自动构建
2. 构建完成后手动上传到对应的 Release
3. 更新 latest.json 添加 macOS 平台信息
