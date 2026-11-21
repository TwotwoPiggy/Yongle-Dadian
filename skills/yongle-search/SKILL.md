---
name: yongle-search
description: 检索知识库历史Bug经验与方案，或召回个人风格与决策记忆
---

<objective>
统一检索入口，涵盖「技术经验检索（Search）」与「个人偏好/历史决策记忆召回（Recall）」。用户无需记忆参数，直接输入关键词或自然语言即可自动分流。
</objective>

<process>

### 1. 意图识别与自动路由

根据用户输入（`$ARGUMENTS` 或自然语言描述）自动判断检索类型：

- **分支 A：检索历史 Bug 修复经验与技术方案（默认）**
  - **触发条件**：用户输入具体报错、技术关键词、方案名称，或按标签/类型查询。
  - **执行流程**：参照 `@{{YONGLE_INSTALL_DIR}}/workflows/yongle-search.md`，运行混合检索（SQLite FTS + LanceDB 向量检索）：
    ```bash
    node "{{YONGLE_INSTALL_DIR}}/scripts/yongle-hybrid-search.js" "global" "$ARGUMENTS"
    ```
  - **输出要求**：直接将脚本输出的检索结果用 ` ```text ` 代码块原样呈现，避免多余改写以保持极速响应。

- **分支 B：召回个人风格、习惯或历史架构决策（原 `yongle-recall`）**
  - **触发条件**：用户提及“召回”、“我的风格/偏好/习惯”、“历史决策”，或显式带有 `--recall` / `style` / `decisions`。
  - **执行流程**：参照 `@{{YONGLE_INSTALL_DIR}}/workflows/yongle-recall.md`：
    1. 依次检查本地 `.planning/yongle/memory/INDEX.json` 与全局 `~/.yongle_knowledge/memory/INDEX.json`。
    2. 匹配并读取对应的 `.md` 记忆文件（涵盖 `style`、`decisions`、`patterns`、`thoughts`）。
    3. 将记忆内容注入当前上下文，并向用户确认已对齐该风格或决策。

- **分支 C：未提供任何关键词时**
  - 主动使用交互提问（`ask_question`）或简短询问用户想要「检索特定技术/Bug经验」还是「召回个人代码风格与决策记忆」。

</process>
