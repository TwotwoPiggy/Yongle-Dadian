---
name: yongle:update
description: 检查并更新永乐大典到最新版本
allowed-tools:
  - Read
  - Write
  - Bash
---

<objective>
检查并更新永乐大典知识库到最新版本，并重新注入技能（skills）与工作流（workflows）到对应的 AI 运行时。
</objective>

<process>
执行自动更新脚本：
```bash
node scripts/yongle-update.js
```
</process>
