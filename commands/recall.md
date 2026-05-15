---
name: yongle:recall
description: 手动召回个人库中的风格、决策或思维模式记忆。
argument-hint: [category/topic]
allowed-tools:
  - Read
  - Write
  - Bash
---

<objective>
用户觉得当前 Agent 的输出不符合其风格，或需要查阅某项历史决策时，可以使用此命令显式拉取记忆到上下文。
同时也供 Agent 在“被动对齐”时自行内部调用。
</objective>

<process>
Execute the yongle-recall workflow from @~/.gemini/antigravity/get-shit-done/workflows/yongle-recall.md end-to-end.
</process>
