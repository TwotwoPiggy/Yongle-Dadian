const { stripApiKeysFromFile } = require('./yongle-config-sanitizer');
const { globalConfigPath } = require('./yongle-config');

async function exportConfig() {
  try {
    const sanitizedConfig = stripApiKeysFromFile(globalConfigPath);
    console.log(JSON.stringify(sanitizedConfig, null, 2));
  } catch (err) {
    console.error(`[Export Error] ${err.message}`);
    process.exit(1);
  }
}

// 独立执行入口
if (require.main === module) {
  exportConfig();
}

module.exports = { exportConfig };
