const fs = require('fs');
const path = require('path');

// Configuration
const packageJsonPath = path.resolve(__dirname, '../package.json');
const packageJson = require(packageJsonPath);
const version = packageJson.version;
const productName = "HeTaoSSH";
const repoUrl = "https://github.com/hthappy/HeTaoSSH";

// Paths
const nsisDir = path.resolve(__dirname, '../src-tauri/target/release/bundle/nsis');
const msiDir = path.resolve(__dirname, '../src-tauri/target/release/bundle/msi');

// Helper to find signature file
function findSignature(dir, extension) {
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir);
    const sigFile = files.find(f => f.endsWith(`${extension}.sig`) && f.includes(version));
    return sigFile ? path.join(dir, sigFile) : null;
}

console.log(`Generating latest.json for version ${version}...`);

let updateData = {
    version: version,
    notes: `See ${repoUrl}/releases/tag/v${version} for details.`,
    pub_date: new Date().toISOString(),
    platforms: {}
};

// 1. Try NSIS (Preferred for auto-update)
const nsisSigPath = findSignature(nsisDir, '.exe');
if (nsisSigPath) {
    const signature = fs.readFileSync(nsisSigPath, 'utf8').trim();
    const filename = path.basename(nsisSigPath).replace('.sig', '');
    
    updateData.platforms['windows-x86_64'] = {
        signature: signature,
        url: `${repoUrl}/releases/download/v${version}/${filename}`
    };
    console.log(`Found NSIS signature for windows-x86_64`);
}

// 2. Try MSI (Fallback or additional)
// Note: Usually we use one or the other for the same platform key. 
// If NSIS exists, it takes precedence for 'windows-x86_64' usually.

if (Object.keys(updateData.platforms).length === 0) {
    console.error("No signatures found! Build might have failed or skipping signing.");
    process.exit(1);
}

// Write latest.json to Project Root (as requested)
const outputPath = path.resolve(__dirname, '../latest.json');

fs.writeFileSync(outputPath, JSON.stringify(updateData, null, 2));
console.log(`Successfully generated latest.json at: ${outputPath}`);
