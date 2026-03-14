const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Load private key content
const keyPath = path.join(__dirname, 'tauri.key.txt');
if (!fs.existsSync(keyPath)) {
  console.error('Error: scripts/tauri.key.txt not found!');
  process.exit(1);
}
// Read base64 content
const privateKey = fs.readFileSync(keyPath, 'utf8').trim();

// Set environment variables
// Note: TAURI_SIGNING_PRIVATE_KEY accepts raw content or file path.
// Passing content directly is safer as it avoids file path issues on Windows.
process.env.TAURI_SIGNING_PRIVATE_KEY = privateKey;
process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = 'hetaossh';

console.log('Building Tauri app with signing keys...');
console.log(`Private Key length: ${privateKey.length}`);

try {
  // 1. Build Frontend first (to match original pipeline logic)
  console.log('Building Frontend...');
  execSync('pnpm build', { stdio: 'inherit' });

  // 2. Build Tauri
  console.log('Building Tauri Backend...');
  execSync('pnpm tauri build --verbose', { 
    stdio: 'inherit',
    env: process.env 
  });
} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
}
