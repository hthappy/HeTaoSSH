const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 配置文件路径
const PACKAGE_JSON_PATH = path.resolve(__dirname, '../package.json');
const TAURI_CONF_PATH = path.resolve(__dirname, '../src-tauri/tauri.conf.json');

// 读取当前版本
const packageJson = require(PACKAGE_JSON_PATH);
const currentVersion = packageJson.version;

console.log(`Current version: ${currentVersion}`);

// 计算新版本 (默认 patch)
const args = process.argv.slice(2);
let type = 'patch';
if (args.includes('--minor')) type = 'minor';
if (args.includes('--major')) type = 'major';

const [major, minor, patch] = currentVersion.split('.').map(Number);
let newVersion = '';

switch (type) {
  case 'major':
    newVersion = `${major + 1}.0.0`;
    break;
  case 'minor':
    newVersion = `${major}.${minor + 1}.0`;
    break;
  case 'patch':
  default:
    newVersion = `${major}.${minor}.${patch + 1}`;
    break;
}

console.log(`New version: ${newVersion}`);

// 更新 package.json
packageJson.version = newVersion;
fs.writeFileSync(PACKAGE_JSON_PATH, JSON.stringify(packageJson, null, 2) + '\n');
console.log('Updated package.json');

// 更新 tauri.conf.json
const tauriConf = require(TAURI_CONF_PATH);
tauriConf.version = newVersion;
fs.writeFileSync(TAURI_CONF_PATH, JSON.stringify(tauriConf, null, 2) + '\n');
console.log('Updated tauri.conf.json');

// 执行 Git 命令
try {
  console.log('Executing git commands...');
  execSync('git add .', { stdio: 'inherit' });
  execSync(`git commit -m "chore(release): v${newVersion}"`, { stdio: 'inherit' });
  execSync(`git tag v${newVersion}`, { stdio: 'inherit' });
  
  console.log('\n---------------------------------------------------------');
  console.log(`Successfully created tag v${newVersion}`);
  console.log('Now push to GitHub to trigger the release workflow:');
  console.log('\n    git push && git push --tags\n');
  console.log('---------------------------------------------------------');
  
  // 询问是否自动 push
  // 由于非交互式环境，这里直接提示用户手动 push 或者可以通过参数 --push 自动 push
  if (args.includes('--push')) {
      console.log('Pushing to remote...');
      try {
        execSync('git push origin master && git push origin --tags', { stdio: 'inherit' });
        console.log('Successfully pushed to remote.');
      } catch (e) {
         // Try generic push if origin master fails (e.g. main branch)
         execSync('git push && git push --tags', { stdio: 'inherit' });
      }
  }

} catch (error) {
  console.error('Git operation failed:', error.message);
  process.exit(1);
}
