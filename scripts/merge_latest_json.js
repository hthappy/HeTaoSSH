const fs = require('fs');
const path = require('path');

// Arguments:
// 1. Path to existing (remote) latest.json (e.g., containing Windows info)
// 2. Path to newly built (local) latest.json (e.g., containing macOS info)
// 3. Output path for merged JSON

const remotePath = process.argv[2];
const localPath = process.argv[3];
const outputPath = process.argv[4] || 'latest.json';

console.log(`Merging ${remotePath} and ${localPath} into ${outputPath}`);

let remoteJson = {};
let localJson = {};

try {
  if (fs.existsSync(remotePath)) {
    remoteJson = JSON.parse(fs.readFileSync(remotePath, 'utf8'));
    console.log('Loaded remote JSON:', Object.keys(remoteJson.platforms || {}));
  } else {
    console.log('Remote JSON not found, skipping merge.');
  }
} catch (e) {
  console.error('Error reading remote JSON:', e.message);
}

try {
  if (fs.existsSync(localPath)) {
    localJson = JSON.parse(fs.readFileSync(localPath, 'utf8'));
    console.log('Loaded local JSON:', Object.keys(localJson.platforms || {}));
  } else {
    console.error('Local JSON not found at', localPath);
    process.exit(1);
  }
} catch (e) {
  console.error('Error reading local JSON:', e.message);
  process.exit(1);
}

// Start with local JSON (newest version info)
const mergedJson = { ...localJson };

// Merge platforms from remote
if (remoteJson.platforms) {
  mergedJson.platforms = {
    ...remoteJson.platforms,
    ...localJson.platforms
  };
}

// Ensure version/notes/pub_date are from the newest (local)
// But if remote has newer pub_date? Usually local build is newer or same.
// We assume same version release.

console.log('Merged platforms:', Object.keys(mergedJson.platforms));

fs.writeFileSync(outputPath, JSON.stringify(mergedJson, null, 2));
console.log('Successfully wrote merged JSON.');
