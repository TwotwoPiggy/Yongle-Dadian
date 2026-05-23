---
name: yongle:sync-config
description: 使用 Git 推拉全局配置文件，自动过滤并恢复 apiKey
argument-hint: [--pull]
allowed-tools:
  - Read
  - Write
  - Bash
---
<objective>
将全局配置文件 (~/.yongle_knowledge/config.json) 推送到 Git 远端，或从远端拉取并合并。
- 默认进行 Push：自动剥离 apiKey，提交并推送到远端，然后本地恢复 apiKey。
- 加上 `--pull` 进行 Pull：从远端获取 config.json，并通过导入预览流程与本地合并。
</objective>

<process>
运行 `node D:/Computers/AIDevelop/Tools/Skills/yongle-dadian/scripts/yongle-sync-config.js [--pull]` 执行同步流程。
如果触发了导入预览，需在控制台交互确认。
</process>
