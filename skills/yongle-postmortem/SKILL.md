---
name: yongle-postmortem
description: 复盘提炼Bug修复经验并归档，支持草稿转正与长任务过程追踪
---

<objective>
统一的知识捕获与复盘入口，整合「复盘提炼归档（Postmortem）」、「草稿转正（Confirm）」与「长任务过程探针（Tag）」。支持上下文感知与自然语言触发，无需记忆额外命令名或参数。
</objective>

<process>

### 1. 意图与上下文自动感知路由

根据用户输入或当前环境状态自动进入对应分支：

- **分支 A：对话复盘与经验归档（默认）**
  - **触发条件**：用户直接调用本技能，或要求“复盘”、“总结归档刚才的 Bug”。
  - **执行流程**：完整遵循 `@{{YONGLE_INSTALL_DIR}}/workflows/yongle-postmortem.md`：
    1. 若当前项目存在 `.planning/yongle/WATCHING.md`，优先读取其中的时间线作为第一手试错轨迹。
    2. 执行双阶段思维链（Two-Step CoT）分析：还原最初报错、失败尝试（Negative Trials）、本质根因与最终修复方案。
    3. 嗅探查重（支持 `create_new` 新建、`supplement` 原地补充、`supersede` 迭代替换）。
    4. 支持一步直接归档并更新 SQLite 索引（或按需存为 `.draft.md` 草稿）。

- **分支 B：草稿审阅转正（原 `yongle-confirm`）**
  - **触发条件**：用户提及“转正”、“确认草稿”、传入 `.draft.md` 路径、带有 `--confirm`，或当前无复盘上下文但检测到待归档草稿且用户选择转正。
  - **执行流程**：遵循 `@{{YONGLE_INSTALL_DIR}}/workflows/yongle-confirm.md`：
    1. 自动扫描 `~/.yongle_knowledge/*.draft.md`（及 `drafts/*.md`）供用户点选，或读取指定草稿。
    2. 清洗 `draft: true` 标记，执行原地演进合流并写入正式知识库与 SQLite 索引（`node "{{YONGLE_INSTALL_DIR}}/scripts/yongle-confirm.js"`）。

- **分支 C：开启长任务过程探针（原 `yongle-tag`）**
  - **触发条件**：用户提及“开启追踪/探针/插眼”、“边做边记”或带有 `--tag`。
  - **执行流程**：遵循 `@{{YONGLE_INSTALL_DIR}}/workflows/yongle-tag.md`：
    1. 在 `.planning/yongle/WATCHING.md` 初始化任务目标、初始假设与 `## ⏳ 过程时间线 (Timeline)`。
    2. 在后续排查过程中持续追加关键尝试与进展，供最终复盘时提取。

</process>
