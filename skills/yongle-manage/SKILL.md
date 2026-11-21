---
name: yongle-manage
description: 运维总控台：状态看板、健康巡检、索引重建、云同步、配置与更新
---

<objective>
一站式接管永乐大典所有运维、同步与配置管理功能（整合原 `status`、`lint`、`reindex`、`sync`、`sync-config`、`config-export`、`config-import`、`update`）。支持无参数可视化点选菜单与自然语言直达，彻底免除参数记忆负担。
</objective>

<process>

### 1. 无参数调用：展示状态看板 + 弹出交互式菜单

当用户直接调用 `/yongle-manage` 且未指明具体子操作时：
1. **先展示运行状态看板**：
   ```bash
   node "{{YONGLE_INSTALL_DIR}}/scripts/yongle-status.js"
   ```
2. **弹出交互式点选菜单**（使用 `ask_question` 工具），让用户直接点选下一步操作：
   - `(Recommended) 健康巡检与自愈 (Lint)`
   - `知识库云端同步 (Sync Knowledge)`
   - `重建 SQLite 索引 (Reindex)`
   - `全局配置管理 (Git 同步 / 导出 / 导入)`
   - `检查并更新版本 (Update)`

---

### 2. 自然语言或指定操作：直接路由执行

当用户通过菜单点选、自然语言描述或参数指定具体操作时，直接执行对应模块：

- **运行状态看板 (`status`)**
  - 查看前置搜索、会话停止自动归档、梦境守护整理的运行状态与最近日志：
    ```bash
    node "{{YONGLE_INSTALL_DIR}}/scripts/yongle-status.js"
    ```

- **健康巡检与自愈 (`lint`)**
  - 参照 `@{{YONGLE_INSTALL_DIR}}/workflows/yongle-lint.md`，排查 Frontmatter 破损、孤儿条目、幽灵记录、死链及语义冗余（支持 `--fix` 自动修复、`--deep` 深度语义审计）：
    ```bash
    node "{{YONGLE_INSTALL_DIR}}/scripts/yongle-lint.js" auto --fix
    ```

- **重建索引 (`reindex`)**
  - 参照 `@{{YONGLE_INSTALL_DIR}}/workflows/yongle-reindex.md`，重新扫描 Markdown 条目并构建 SQLite 索引（默认 `global`，可选 `local`）：
    ```bash
    node "{{YONGLE_INSTALL_DIR}}/scripts/reindex.js" global
    ```

- **知识库云同步 (`sync`)**
  - 同步本地知识条目至项目 Git 仓库或全局 GitHub 私有仓库：
    ```bash
    node "{{YONGLE_INSTALL_DIR}}/scripts/yongle-sync-knowledge.js"
    ```

- **全局配置 Git 推拉 (`sync-config`)**
  - 参照 `@{{YONGLE_INSTALL_DIR}}/workflows/yongle-sync-config.md`，使用 Git 推送或拉取（`--pull`）`~/.yongle_knowledge/config.json`，自动剥离与恢复 `apiKey`：
    ```bash
    node "{{YONGLE_INSTALL_DIR}}/scripts/yongle-sync-config.js"
    ```

- **全局配置导出 / 导入 (`config-export` / `config-import`)**
  - **导出**：参照 `@{{YONGLE_INSTALL_DIR}}/workflows/yongle-config-export.md`，输出排除 `apiKey` 后的配置 JSON：
    ```bash
    node "{{YONGLE_INSTALL_DIR}}/scripts/yongle-config-export.js"
    ```
  - **导入**：参照 `@{{YONGLE_INSTALL_DIR}}/workflows/yongle-config-import.md`，对指定 JSON 文件执行 dry-run 预览并深度合并至全局配置：
    ```bash
    node "{{YONGLE_INSTALL_DIR}}/scripts/yongle-config-import.js" <file>
    ```

- **版本检查与更新 (`update`)**
  - 自动识别 Git 或 npm 安装模式，拉取最新版本并重新注入技能与工作流：
    ```bash
    node "{{YONGLE_INSTALL_DIR}}/scripts/yongle-update.js"
    ```

</process>
