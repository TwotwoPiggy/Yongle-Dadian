---
title: Yongle 知识检索工作流
---

# Yongle 知识检索

本工作流负责执行知识库检索并展示格式化结果。

## 步骤 1: 执行检索

调用 SDK 检索处理器。

```bash
/gsd-tools query yongle.search "{{query}}" {{#each filters}}"{{this}}" {{/each}} --pick data
```

## 步骤 2: 结果展示

如果找到结果，以列表形式展示：

- **ID**: {{id}}
- **日期**: {{date}}
- **类型**: {{resolution_type}}
- **摘要**: {{cause_summary}}
- **标签**: {{tags}}
- **路径**: [打开文件]({{filepath}})

---

> [!TIP]
> 检索范围包括全局知识库 (`~/.yongle_knowledge/`)。
