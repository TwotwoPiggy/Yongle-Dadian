const { syncKnowledge } = require('./yongle-sync-knowledge');
const { loadMergedConfig } = require('./yongle-config');

try {
  const config = loadMergedConfig();
  // Provide a default 15 minute interval if not set
  let intervalMs = 15 * 60 * 1000; 
  if (config.yongle && config.yongle.sync && config.yongle.sync.interval) {
    intervalMs = parseInt(config.yongle.sync.interval, 10) || intervalMs;
  }

  // Initial pull on start
  syncKnowledge({ pullOnly: true });

  // Daemonize periodic sync
  const intervalId = setInterval(() => {
    try {
      syncKnowledge({ pullOnly: true });
    } catch(err) {
      console.error(`\n⚠ 知识库后台同步失败:`, err.message);
    }
  }, intervalMs);

  // Unref the timer so it doesn't block the Node process from exiting
  if (intervalId.unref) {
    intervalId.unref();
  }
} catch (err) {
  // Do not crash the parent process (the agent CLI)
  console.error(`\n⚠ 知识库同步 Hook 启动失败:`, err.message);
}
