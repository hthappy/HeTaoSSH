const fs = require('fs');
const path = require('path');

// Read version
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const version = packageJson.version;

console.log(`Testing asset discovery for version ${version}...\n`);

const bundleDir = path.join('src-tauri', 'target', 'release', 'bundle', 'msi');
const nsisDir = path.join('src-tauri', 'target', 'release', 'bundle', 'nsis');

function listAssets(dir, label) {
  console.log(`${label} Directory: ${dir}`);
  if (!fs.existsSync(dir)) {
    console.log('  ✗ Directory does not exist\n');
    return [];
  }
  
  const files = fs.readdirSync(dir);
  console.log(`  Found ${files.length} file(s):`);
  files.forEach(f => {
    const stat = fs.statSync(path.join(dir, f));
    const size = (stat.size / 1024 / 1024).toFixed(2);
    console.log(`    - ${f} (${size} MB)`);
  });
  console.log('');
  
  return files;
}

const msiFiles = listAssets(bundleDir, 'MSI');
const exeFiles = listAssets(nsisDir, 'NSIS');

// Filter for current version
const msiForVersion = msiFiles.filter(f => f.includes(version) && f.endsWith('.msi') && !f.endsWith('.msi.sig') && !f.includes('_en-US'));
const exeForVersion = exeFiles.filter(f => f.includes(version) && f.endsWith('.exe') && !f.endsWith('.exe.sig') && !f.includes('_en-US'));

console.log('Assets to upload:');
console.log(`  MSI: ${msiForVersion.length > 0 ? msiForVersion.join(', ') : 'None'}`);
console.log(`  EXE: ${exeForVersion.length > 0 ? exeForVersion.join(', ') : 'None'}`);

if (msiForVersion.length === 0 && exeForVersion.length === 0) {
  console.error('\n✗ ERROR: No assets found for current version!');
  console.error('  Possible issues:');
  console.error('  1. Build has not been run yet');
  console.error('  2. Version mismatch between package.json and build output');
  console.error('  3. Build failed');
  process.exit(1);
}

console.log('\n✓ Asset discovery test passed!');
