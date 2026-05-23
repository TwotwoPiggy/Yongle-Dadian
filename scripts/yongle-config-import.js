const fs = require('fs');
const readline = require('readline');
const { hasApiKeys, stripApiKeys, stripApiKeysFromFile } = require('./yongle-config-sanitizer');
const { deepMerge, globalConfigPath } = require('./yongle-config');
const path = require('path');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askConfirmation(query) {
  return new Promise(resolve => {
    rl.question(query, answer => {
      resolve(answer.trim().toLowerCase());
    });
  });
}

function printDryRunPreview(local, incoming) {
  console.log('=== Import Preview ===');
  const allKeys = new Set([...Object.keys(local), ...Object.keys(incoming)]);
  
  for (const key of allKeys) {
    if (!(key in local) && (key in incoming)) {
      console.log(`+ [${key}]: added`);
    } else if ((key in local) && !(key in incoming)) {
      // It's a deep merge where missing keys aren't deleted, so we mark it as unchanged from local perspective
      console.log(`✓ [${key}]: unchanged (not present in import, keeping local)`);
    } else {
      // Basic deep equality check for preview
      const localStr = JSON.stringify(local[key]);
      const incomingStr = JSON.stringify(incoming[key]);
      if (localStr === incomingStr) {
        console.log(`✓ [${key}]: unchanged`);
      } else {
        console.log(`✎ [${key}]: updated`);
      }
    }
  }
  console.log('======================\n');
}

async function importConfig() {
  const importFile = process.argv[2];
  if (!importFile) {
    console.error('Error: Please provide an import file path.');
    process.exit(1);
  }

  const importPath = path.resolve(process.cwd(), importFile);
  if (!fs.existsSync(importPath)) {
    console.error(`Error: File not found: ${importPath}`);
    process.exit(1);
  }

  try {
    const rawContent = fs.readFileSync(importPath, 'utf8');
    let incomingConfig = JSON.parse(rawContent.replace(/^\uFEFF/, ''));

    if (hasApiKeys(incomingConfig)) {
      console.warn('\nWarning: import file contains apiKey fields — they will be stripped automatically (D-03).\n');
      incomingConfig = stripApiKeys(incomingConfig);
    }

    const localConfig = stripApiKeysFromFile(globalConfigPath);
    
    printDryRunPreview(localConfig, incomingConfig);

    const answer = await askConfirmation('Apply this import? [y/N]: ');
    if (answer === 'y' || answer === 'yes') {
      const mergedConfig = deepMerge(localConfig, incomingConfig);
      
      const configDir = path.dirname(globalConfigPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      fs.writeFileSync(globalConfigPath, JSON.stringify(mergedConfig, null, 2), 'utf8');
      console.log(`\nImport successful. Merged config saved to ${globalConfigPath}`);
    } else {
      console.log('\nImport cancelled.');
      process.exit(1);
    }
  } catch (err) {
    console.error(`\nImport failed: ${err.message}`);
    process.exit(1);
  } finally {
    rl.close();
  }
}

if (require.main === module) {
  importConfig();
}

module.exports = { importConfig };
