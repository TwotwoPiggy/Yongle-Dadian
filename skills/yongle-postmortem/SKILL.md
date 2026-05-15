---
name: yongle-postmortem
description: 触发永乐大典复盘，提炼当前对话中的Bug修复经验并归档为知识条目
---


<objective>
从当前的对话上下文中，智能识别与提取 AI 辅助开发过程中出现的错误、调试过程及最终解决方案，将其归纳凝练成符合"永乐大典"元数据规范的标准化知识条目，草稿存入本地，待用户人工确认后正式归档，防止重复踩坑。
</objective>

<process>
Execute the yongle-postmortem workflow from the yongle-dadian installation:
1. First check YONGLE_HOME env var for custom install path.
2. Otherwise resolve from the skills directory: find the `workflows/yongle-postmortem.md` relative to this skill's parent package.
3. Follow the workflow end-to-end.

Workflow location: @{{YONGLE_INSTALL_DIR}}/workflows/yongle-postmortem.md
</process>
