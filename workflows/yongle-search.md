---
title: Yongle 知识检索工作流
---

# Yongle 知识检索 (Hybrid Search)

本工作流负责执行混合知识检索（SQLite全文搜索 + LanceDB向量搜索）。

## 步骤 1: 检索与融合

调用 Node.js 混合检索核心脚本。默认检索范围为全局知识库 (`~/.yongle_knowledge/`)。

```bash
# 确定范围，默认为 global
DB_SCOPE="global"
# 执行 Hybrid Search (自带高亮与 RRF 融合渲染)
node yongle-dadian/scripts/yongle-hybrid-search.js "$DB_SCOPE" "$ARGUMENTS"
```

## 步骤 2: 结果呈现输出要求 (降低大模型生成时延)

> [!IMPORTANT]
> **大模型响应提速核心指令**：为了彻底消除大模型逐字排版、翻译、总结或绘制 Markdown 表格带来的高额生成延迟（30秒），请大模型在此步骤中 **必须且仅** 采取以下行为：
> 1. **直接输出** 上一步命令行执行所打印出来的完整内容，并将其用 ` ```text ` 代码块包裹。
> 2. **禁止** 对命令行输出进行任何多余的总结、重写、翻译、解释或答谢。
> 3. 原样输出后立即结束本次回答，以保证最快的首字渲染与极速响应！

