---
title: Yongle 知识检索工作流
---

# Yongle 知识检索 (Hybrid Search)

本工作流负责执行混合知识检索（SQLite全文搜索 + LanceDB向量搜索），并以流式方式更新结果。

## 步骤 1: 检索与融合

调用 Node.js 混合检索核心脚本。默认检索范围为全局知识库 (`~/.yongle_knowledge/`)。

```bash
# 确定范围，默认为 global
DB_SCOPE="global"
# 执行 Hybrid Search (自带高亮与 RRF 融合渲染)
node yongle-dadian/scripts/yongle-hybrid-search.js "$DB_SCOPE" "$ARGUMENTS"
```

---
> [!TIP]
> 支持直接输入报错信息、自然语言问题或明确的专有名词进行检索。
