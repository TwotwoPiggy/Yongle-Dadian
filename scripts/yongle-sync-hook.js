const { syncKnowledge } = require('./yongle-sync-knowledge');

try {
  // SessionStart hook: pull only, don't push
  syncKnowledge({ pullOnly: true });
} catch (err) {
  // Do not crash the parent process (the agent CLI)
  console.error(`\n⚠ 知识库同步失败: Hook execution error:`, err.message);
}
