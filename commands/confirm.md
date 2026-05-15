---
name: yongle:confirm
description: 将永乐大典草稿升级为正式归档条目
argument-hint: [draft-file-path]
allowed-tools:
  - Read
  - Write
  - Bash
---

<objective>
用户通过 `/yongle-postmortem` 生成草稿后，可以手动审阅编辑。该命令负责读取审阅后的草稿，执行最后的清洗操作（去除 `draft` 标记），将其移动到正式知识库并更新索引。
</objective>

<process>
Execute the yongle-confirm workflow from @~/.gemini/antigravity/get-shit-done/workflows/yongle-confirm.md end-to-end.
</process>
