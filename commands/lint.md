---
name: yongle:lint
description: 知识库健康巡检与自愈，排查格式破损、孤儿条目、死链及语义冗余
argument-hint: [--local|--global] [--deep] [--fix]
allowed-tools:
  - Read
  - Write
  - Bash
---

<objective>
对永乐大典知识库执行全面的结构与语义双重体检（Layer 1 确定性结构检查 + Layer 2 深度语义审计），并在用户允许或指定 --fix 时自动自愈修复破损格式与缺失索引。
</objective>

<process>
Execute the yongle-lint workflow from @~/.gemini/antigravity/get-shit-done/workflows/yongle-lint.md end-to-end.
</process>
