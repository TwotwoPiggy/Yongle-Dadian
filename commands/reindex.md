---
name: yongle:reindex
description: 重新扫描知识库目录并构建 SQLite 索引
argument-hint: [--local|--global]
allowed-tools:
  - Read
  - Write
  - Bash
  - ListDir
---

<objective>
该指令用于手动触发索引重修。它将遍历目标目录下的所有 Markdown 文件，提取元数据并写入 SQLite 数据库，确保检索内容的准确性。
</objective>

<process>
Execute the yongle-reindex workflow from @~/.gemini/antigravity/get-shit-done/workflows/yongle-reindex.md end-to-end.
</process>
