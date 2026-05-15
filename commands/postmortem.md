---
name: yongle:postmortem
description: 触发永乐大典复盘，提炼当前对话中的Bug修复经验并归档为知识条目
argument-hint: [--global|--local] [--model <model-name>]
allowed-tools:
  - Read
  - Write
  - Bash
---

<objective>
从当前的对话上下文中，智能识别与提取 AI 辅助开发过程中出现的错误、调试过程及最终解决方案，将其归纳凝练成符合"永乐大典"元数据规范的标准化知识条目，草稿存入本地，待用户人工确认后正式归档，防止重复踩坑。
</objective>

<process>
Execute the yongle-postmortem workflow from @~/.gemini/antigravity/get-shit-done/workflows/yongle-postmortem.md end-to-end.
</process>
