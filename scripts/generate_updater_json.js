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
    console.log(`✓ Found NSIS signature for windows-x86_64: ${filename}`);
} else {
    // Check if there's an unsigned NSIS installer (signing might have failed)
    if (fs.existsSync(nsisDir)) {
        const nsisFiles = fs.readdirSync(nsisDir).filter(f => f.includes(version) && f.endsWith('.exe') && !f.endsWith('.sig'));
        if (nsisFiles.length > 0) {
            console.warn(`⚠ Warning: Found unsigned NSIS installer(s): ${nsisFiles.join(', ')}`);
            console.warn('  Signing might have failed. Auto-update will not work without signature.');
        }
    }
}

// 2. MSI files (for manual download, not used for auto-update)
// Note: Tauri updater uses NSIS for Windows auto-update
// MSI is available for enterprise/manual installation
if (fs.existsSync(msiDir)) {
    const msiFiles = fs.readdirSync(msiDir).filter(f => f.includes(version) && f.endsWith('.msi') && !f.endsWith('.msi.sig'));
    if (msiFiles.length > 0) {
        console.log(`✓ Found MSI installer(s): ${msiFiles.join(', ')}`);
    }
}

if (Object.keys(updateData.platforms).length === 0) {
    console.error("✗ No Windows signatures found! Build might have failed or signing was skipped.");
    console.error("  Auto-update will NOT work without valid signatures.");
    console.error("");
    console.error("Possible causes:");
    console.error("  1. Build failed - check build logs");
    console.error("  2. Signing failed - check Tauri configuration");
    console.error("  3. Wrong version number in package.json");
    console.error("");
    console.error("Directories checked:");
    console.error(`  NSIS: ${nsisDir}`);
    console.error(`  MSI:  ${msiDir}`);
    
    // List directory contents for debugging
    if (fs.existsSync(nsisDir)) {
        console.error(`  NSIS contents: ${fs.readdirSync(nsisDir).join(', ')}`);
    }
    if (fs.existsSync(msiDir)) {
        console.error(`  MSI contents: ${fs.readdirSync(msiDir).join(', ')}`);
    }
    
    process.exit(1);
}

// Write latest.json to Project Root (as requested)
const outputPath = path.resolve(__dirname, '../latest.json');

fs.writeFileSync(outputPath, JSON.stringify(updateData, null, 2));
console.log(`Successfully generated latest.json at: ${outputPath}`);
