# 永乐大典 (Yongle Dadian)

> **知识就是力量，但只有能被找回的知识才是生产力。**

AI 开发经验知识库引擎。自动复盘、过程追踪、毫秒级检索。

## 功能

| 指令 | 描述 |
|------|------|
| `/yongle-postmortem` | 自动复盘：从对话中提取 Bug 修复经验并归档 |
| `/yongle-confirm` | 将草稿升级为正式归档条目 |
| `/yongle-search` | 基于 SQLite FTS5 的毫秒级知识检索 |
| `/yongle-recall` | 手动召回风格、决策或思维模式记忆 |
| `/yongle-tag` | 开启"过程探针"活跃追踪 |
| `/yongle-reindex` | 重建 SQLite 索引 |
| `/yongle-sync` | 云同步知识库到 GitHub |
| `/yongle-update` | 更新永乐大典到最新版本 |

## 安装

### 通过 npm（全局安装）

```bash
npx yongle-dadian --global --antigravity
```

### 本地脚本安装

```bash
git clone <repo-url> yongle-dadian
cd yongle-dadian
node bin/install.js --global --antigravity
```

## 支持的 Runtime

- Antigravity
- Gemini CLI
- Claude Code
- 其他兼容的 AI Agent Runtime

## 与 GSD 的关系

永乐大典是一个**独立项目**。它不依赖 GSD 运行，也不会被 GSD 更新覆盖。两者可以并行安装、独立更新。

## License

MIT
