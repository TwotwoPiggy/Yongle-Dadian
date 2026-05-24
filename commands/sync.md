---
name: yongle:sync
description: 触发"永乐大典"知识库的云同步。支持同步全局经验到 GitHub 以及同步项目级经验到项目 Repo。
argument-hint: [status] [--scope all|project|global] [--setup] [--config [--pull]]
allowed-tools:
  - Read
  - Write
  - Bash
---

<objective>
将本地存储的"永乐大典"知识条目（KI）同步至云端。
1. 项目级经验：通过当前 Git 仓库同步。
2. 全局级经验：同步至用户指定的 GitHub 私有仓库。
3. 冲突处理：在发现远端领先时触发交互式询问。
4. New: `--config` flag to sync `config.json` (apiKeys stripped). Use `--config --pull` to fetch remote config with interactive section merge.
</objective>

<process>
If the argument `status` or `--status` is present, check for the sync status file and output it:
```bash
if [ -f .planning/SYNC-STATUS.md ]; then
  cat .planning/SYNC-STATUS.md
else
  echo "暂无后台同步状态信息。"
fi
```

Else if the `--config` flag is present, execute:
```bash
node scripts/yongle-sync-config.js ${ARGUMENTS}
```

Else, execute the knowledge synchronization:
```bash
node scripts/yongle-sync-knowledge.js
```
</process>
