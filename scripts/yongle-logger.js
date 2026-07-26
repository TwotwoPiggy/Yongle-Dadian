const fs = require('fs');
const path = require('path');
const os = require('os');

const homedir = os.homedir();
const logDir = path.join(homedir, '.yongle_knowledge', 'logs');
const archiveDir = path.join(logDir, 'archives');
const logFilePath = path.join(logDir, 'auto-features.jsonl');

/**
 * 确保日志与归档目录存在
 */
function ensureLogDirs() {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  if (!fs.existsSync(archiveDir)) {
    fs.mkdirSync(archiveDir, { recursive: true });
  }
}

/**
 * 记录一条自动化功能状态日志，并执行超限转储归档
 * @param {Object} params
 * @param {'auto-search'|'auto-archive'|'dreamer'} params.feature
 * @param {'HIT'|'MISS'|'RUNNING'|'SUCCESS'|'ERROR'} params.status
 * @param {number} [params.durationMs]
 * @param {string} [params.details]
 * @param {string} [params.error]
 */
function logAutoFeature({ feature, status, durationMs = 0, details = '', error = '' }) {
  try {
    ensureLogDirs();

    const entry = {
      timestamp: new Date().toISOString(),
      feature,
      status,
      duration_ms: Math.round(durationMs),
      details: details || '',
      error: error || ''
    };

    const line = JSON.stringify(entry) + '\n';

    // 如果日志文件存在，检查行数
    let lines = [];
    if (fs.existsSync(logFilePath)) {
      const content = fs.readFileSync(logFilePath, 'utf8').trim();
      if (content) {
        lines = content.split('\n');
      }
    }

    lines.push(JSON.stringify(entry));

    // 超限切割归档：若总行数达到/超过 1000 条，切割前 850 条转储，保留最新的 150 条
    if (lines.length >= 1000) {
      const archiveLines = lines.slice(0, 850);
      const keepLines = lines.slice(850);

      const timestampSlug = new Date().toISOString().replace(/[:.]/g, '-');
      const archiveFilePath = path.join(archiveDir, `auto-features-${timestampSlug}.jsonl`);

      fs.writeFileSync(archiveFilePath, archiveLines.join('\n') + '\n', 'utf8');
      fs.writeFileSync(logFilePath, keepLines.join('\n') + '\n', 'utf8');
    } else {
      fs.appendFileSync(logFilePath, line, 'utf8');
    }
  } catch (err) {
    // 日志写入静默安全捕获，切勿阻塞主执行流
  }
}

/**
 * 读取最近的自动化功能日志
 * @param {number} [limit=50]
 * @returns {Array<Object>}
 */
function getRecentLogs(limit = 50) {
  try {
    if (!fs.existsSync(logFilePath)) return [];
    const content = fs.readFileSync(logFilePath, 'utf8').trim();
    if (!content) return [];
    const lines = content.split('\n');
    const recent = lines.slice(-limit);
    return recent.map(line => {
      try {
        return JSON.parse(line);
      } catch (e) {
        return null;
      }
    }).filter(Boolean);
  } catch (e) {
    return [];
  }
}

module.exports = {
  logAutoFeature,
  getRecentLogs,
  logFilePath,
  archiveDir
};
