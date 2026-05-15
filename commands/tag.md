---
name: yongle:tag
description: 开启"过程探针"活跃追踪，记录当前任务背景与动态思路，防止长对话阶段导致的上下遗忘。
argument-hint: [task-description]
allowed-tools:
  - Read
  - Write
  - Bash
---

<objective>
用户在开始一项复杂任务（如解 Bug、功能重构）时，通过此命令“插眼”，开启一个后台追踪文件（WATCHING.md）。
该文件将作为 AI Agent 的备忘录，在后续交互中持续累积关键操作与思路。
</objective>

<process>
Execute the yongle-tag workflow from @~/.gemini/antigravity/get-shit-done/workflows/yongle-tag.md end-to-end.
</process>
