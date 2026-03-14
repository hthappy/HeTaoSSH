const fs = require('fs');
const path = require('path');

// Usage: node scripts/merge_latest_json.js <output_path> <input_path_1> <input_path_2> ...

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: node scripts/merge_latest_json.js <output_path> <input_path_1> [input_path_2 ...]');
  process.exit(1);
}

const outputPath = args[0];
const inputPaths = args.slice(1);

console.log(`Merging ${inputPaths.length} files into ${outputPath}`);

let mergedJson = {};

// Iterate through all input files
for (const inputPath of inputPaths) {
  try {
    if (fs.existsSync(inputPath)) {
      const jsonContent = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
      console.log(`Loaded ${inputPath}:`, Object.keys(jsonContent.platforms || {}));
      
      // Initialize mergedJson with the first file's metadata (version, notes, etc.)
      if (Object.keys(mergedJson).length === 0) {
        mergedJson = { ...jsonContent };
        // Ensure platforms object exists
        if (!mergedJson.platforms) {
          mergedJson.platforms = {};
        }
      } else {
        // Merge platforms from subsequent files
        if (jsonContent.platforms) {
          mergedJson.platforms = {
            ...mergedJson.platforms,
            ...jsonContent.platforms
          };
        }
        
        // Optionally update other fields if needed, but usually version/notes are same
        // We prioritize the first file's metadata for simplicity
      }
    } else {
      console.warn(`Input file not found: ${inputPath}, skipping.`);
    }
  } catch (e) {
    console.error(`Error reading ${inputPath}:`, e.message);
  }
}

if (Object.keys(mergedJson).length === 0) {
  console.error('No valid JSON data found to merge.');
  process.exit(1);
}

console.log('Final merged platforms:', Object.keys(mergedJson.platforms || {}));

fs.writeFileSync(outputPath, JSON.stringify(mergedJson, null, 2));
console.log(`Successfully wrote merged JSON to ${outputPath}`);
