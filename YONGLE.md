# 永乐大典 (Yongle Dadian) - 开发者指令手册 (v1.38.3)

> **知识就是力量，但只有能被找回的知识才是生产力。**

本手册详细介绍了“永乐大典”系统中所有可用指令的深度用法、参数配置及最佳实践。

---

## 🔍 知识检索系统

### `/yongle-search`
**功能描述**: 
基于 SQLite FTS5 (Full-Text Search) 的毫秒级搜索引擎，支持在数千条历史经验中瞬间定位解法。

- **语法**: `/yongle-search <查询词> [参数]`
- **参数**:
  - `--tags:<tag1,tag2>`: 仅在匹配指定标签的条目中搜索。
  - `--type:<Bug|Decision|Guide>`: 按条目类型过滤。
  - `--limit:<数字>`: 限制返回结果的数量（默认 5 条）。
  - `--global`: 强制在全局知识库 (`~/.yongle_knowledge`) 中搜索。
- **最佳实践**: 
  当你遇到一个模糊但似曾相识的错误时，直接输入 `/yongle-search error_message`。

### `/yongle-recall`
**功能描述**: 
高精度手动召回指令。与搜索不同，recall 侧重于召回特定项目背景下的思维模式或风格。

- **用法**: `/yongle-recall [意图]`
- **场景**: 当你觉得 AI 开始偏离之前的编码风格或决策路径时使用。

---

## 🧠 自动复盘与沉淀

### `/yongle-postmortem`
**功能描述**: 
永乐大典的核心组件。它会调用专用 Agent 扫描最近的对话历史，自动提取并归档“知识条目 (KI)”。

- **语法**: `/yongle-postmortem`
- **工作流**:
  1. 扫描对话上下文（默认最近 30 轮）。
  2. 识别关键的技术决策或 Bug 修复过程。
  3. 自动生成包含摘要、根因分析和预防措施的 Markdown 文件。
  4. 存入 `.planning/yongle/memory/` 待确认。
- **提示**: 建议在每一个重大的 Bug 修复或 Feature 完成后执行。

### `/yongle-confirm`
**功能描述**: 
将 `/yongle-postmortem` 生成的草稿（Draft）升级为正式归档条目。

- **语法**: `/yongle-confirm [文件名/ID]`
- **效果**: 移动文件至正式目录并触发全量索引更新。

---

## ⚓ 任务控制与一致性

### `/yongle-tag`
**功能描述**: 
开启“过程探针”活跃追踪。在长对话中手动插入一个状态锚点。

- **用法**: `/yongle-tag [当前任务摘要]`
- **为什么需要它？**: 
  在长对话中，随着上下文窗口的移动，AI 容易丢失最初的任务目标。`/yongle-tag` 会将当前状态强制压入记忆栈，确保后续步骤不偏离初衷。

## ⚙️ 配置冗余与覆盖机制 (Configuration Hierarchy)

永乐大典采用 **“四级覆盖，两层冗余”** 的高可靠架构，确保配置的灵活性与数据的安全性。

### 1. 配置加载优先级 (Hierarchy)
当系统运行时，会按以下顺序合并配置，**后者覆盖前者**：

1.  **Code Defaults (内置默认)**: SDK 内置的基础配置，确保零配置下基本功能可用。
2.  **Global Config (全局级)**: 
    - 路径: `~/.yongle_knowledge/config.json`
    - 作用: 定义跨项目的通用设置，如全局同步仓库、身份信息。
3.  **Project Config (项目级)**: 
    - 路径: `{project}/.planning/config.json`
    - 作用: 针对当前项目的特殊配置（如特定项目的分支策略、跳过复盘等）。
4.  **Workstream Config (任务流级)**: 
    - 路径: `{project}/.planning/phases/{id}/config.json`
    - 作用: 仅针对当前任务阶段的临时配置。

### 2. 数据冗余设计 (Data Redundancy)
为了防止单点故障导致的知识丢失，系统维持了两套互补的数据副本：

-   **物理层冗余 (Markdown)**: 
    - 所有的经验条目均以标准 Markdown 存储。
    - **位置**: 
        - 全局: `~/.yongle_knowledge/memory/`
        - 项目: `.planning/yongle/memory/`
    - **优点**: 即使 SQLite 索引损坏，数据依然可读、可搜索（通过 grep）。
-   **逻辑层冗余 (SQLite)**: 
    - 通过扫描 Markdown 自动生成的索引副本 `yongle.db`。
    - **优点**: 极速检索。
    - **自修复**: 运行 `/yongle-reindex` 即可利用 Markdown 物理副本完美重建索引副本。

### 3. 详细配置项参考 (Configuration Reference)

所有的永乐大典相关配置都位于 JSON 的 `yongle` 根对象下。

#### `yongle.sync` (同步配置)
| 字段 | 默认值 | 可选值 | 说明 |
| :--- | :--- | :--- | :--- |
| `mode` | `"manual"` | `"auto"`, `"manual"`, `"both"` | 同步频率。`auto` 会在每次复盘后自动同步；`manual` 仅在手动执行指令时同步。 |
| `global_repo_url` | `null` | Git URL (SSH/HTTPS) | 全局知识库 (`~/.yongle_knowledge`) 的云端备份地址。 |
| `non_git_fallback` | `"fallback"` | `"fallback"`, `"local_only"` | 当项目目录不是 Git 仓库时的处理方式。 |

#### `yongle.postmortem` (复盘配置)
| 字段 | 默认值 | 可选值 | 说明 |
| :--- | :--- | :--- | :--- |
| `context_limit` | `30` | `10` ~ `100` | `/yongle-postmortem` 扫描的历史对话轮数。数值越大消耗 Token 越多，但提取越精确。 |
| `auto_confirm` | `false` | `boolean` | 是否跳过草稿阶段，直接将复盘结果存入正式知识库。 |
| `template` | `null` | 文件路径 | 自定义复盘条目的 Markdown 模板路径。 |

#### `yongle.search` (检索配置)
| 字段 | 默认值 | 可选值 | 说明 |
| :--- | :--- | :--- | :--- |
| `default_limit` | `5` | `1` ~ `20` | `/yongle-search` 默认返回的结果条数。 |
| `semantic_threshold` | `0.7` | `0.0` ~ `1.0` | (预留) 语义搜索的相关度阈值。目前主要用于过滤极低相关度的模糊匹配。 |

#### `yongle.storage` (存储配置)
| 字段 | 默认值 | 可选值 | 说明 |
| :--- | :--- | :--- | :--- |
| `global_path` | `null` | 绝对路径 | 自定义全局知识库的存储位置。默认为家目录下的 `.yongle_knowledge/`。 |

#### `embedding` (向量提取配置)
| 字段 | 默认值 | 可选值 | 说明 |
| :--- | :--- | :--- | :--- |
| `provider` | `"ollama"` | `"gemini"`, `"deepseek"`, `"openai"`, `"ollama"`, `"openai-compatible"` | 向量检索提取器提供商。 |
| `model` | `"nomic-embed-text"` | 各种向量模型 | 提取所选的模型。如 `gemini-embedding-001` 等。 |
| `apiKey` | `null` | 字符串 | 对应的 API 访问令牌。 |
| `baseUrl` | `null` | URL 字符串 | 针对私有部署或兼容端点的自定义基地址。 |

#### `agent` (核心对话模型配置)
| 字段 | 默认值 | 可选值 | 说明 |
| :--- | :--- | :--- | :--- |
| `provider` | `null` | `"gemini"`, `"deepseek"`, `"openai"`, `"ollama"`, `"openai-compatible"` | 对话模型大语言模型提供商。若不指定，将**智能继承**自 `embedding` 处的提供商与密钥，降低配置复杂度。 |
| `model` | `null` | 各种对话模型 | 对应的对话模型名称（如 `gemini-1.5-flash`、`deepseek-chat`）。若不指定，将根据 provider 分配最佳默认轻量模型。 |
| `apiKey` | `null` | 字符串 | 大模型访问令牌。默认自动继承 `embedding` 处的 API 密钥。 |
| `baseUrl` | `null` | URL 字符串 | 自定义大模型服务基地址。默认继承 `embedding` 处的设置。 |

#### `yongle.proxy` (网络代理配置)
| 字段 | 默认值 | 可选值 | 说明 |
| :--- | :--- | :--- | :--- |
| `proxy` | `null` | 代理 URL 字符串 | 所有出站 API 请求的 HTTP/HTTPS 代理地址。格式如 `http://127.0.0.1:7890`。当此项未配置时，系统自动检测环境变量 `HTTPS_PROXY` 或 `HTTP_PROXY` 作为回退。 |
| `proxyEnabled` | `true` | `true`, `false` | 代理总开关。设为 `false` 时，即使配置了代理 URL 或存在环境变量，也强制走直连模式。便于临时关闭代理而无需删除配置。 |

> **优先级**: `yongle.proxy` 配置 > `HTTPS_PROXY` 环境变量 > `HTTP_PROXY` 环境变量 > 直连
>
> **TODO**: SOCKS5 代理支持 (`socks5://...`) 计划在未来版本中加入。

---

### 配置示例 (config.json)

```json
{
  "yongle": {
    "sync": {
      "mode": "auto",
      "global_repo_url": "git@github.com:yourname/my-ai-knowledge.git"
    },
    "postmortem": {
      "context_limit": 50,
      "auto_confirm": true
    },
    "search": {
      "default_limit": 10
    },
    "proxy": "http://127.0.0.1:7890"
  },
  "embedding": {
    "provider": "gemini",
    "model": "gemini-embedding-001",
    "apiKey": "AIzaSy..."
  },
  "agent": {
    "provider": "gemini",
    "model": "gemini-1.5-flash",
    "apiKey": "AIzaSy..."
  }
}
```

---

## 🛠️ 管理与维护指令
**功能描述**: 
扫描所有知识库目录（项目级与全局级），重新构建 SQLite 索引文件。

- **场景**: 
  1. 手动编辑了 Markdown 条目后。
  2. 刚刚完成云端同步后。
  3. 搜索结果出现偏差时。

### `/yongle-sync`
**功能描述**: 
触发“永乐大典”知识库的云同步。

- **参数**:
  - `--project`: 仅同步当前项目的经验到 Git 仓库。
  - `--global`: 同步 `~/.yongle_knowledge` 到您的个人 GitHub 经验仓库。
- **场景**: 在多台电脑间无缝共享 AI 学习到的经验。

---

## 🛠️ 管理与配置

### `/yongle-postmortem-setup`
**功能描述**: 
配置自动复盘的触发阈值和偏好设置。

---

## 📖 与 GSD 协同工作建议

| 阶段 | 推荐指令 | 目的 |
| :--- | :--- | :--- |
| **开始任务** | `/yongle-search` | 查找是否有先例或已知坑点 |
| **任务进行中** | `/yongle-tag` | 锁定关键思路，防止 AI 健忘 |
| **遇到困难** | `/yongle-recall` | 召回过去的类似决策逻辑 |
| **任务结束** | `/yongle-postmortem` | 沉淀本次任务的血泪教训 |
| **多端同步** | `/yongle-sync` | 让所有设备都变聪明 |

---

*“永乐大典”不只是一个工具，它是您的 AI 助手的灵魂。*
