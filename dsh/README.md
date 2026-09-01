# yongle-dadian-dsh — 永乐大典 × DeepSeek Harness 原生插件

永乐大典(DeepSeek Harness 版):把知识库混合检索以**原生工具**形态接入 DSH,并针对
**DeepSeek 上下文缓存**做了 Token 优化。

## 安装(一条命令)

```sh
# 本地源码目录(开发)
dsh plugin --profile web add ./dsh

# 或发布到 npm 后
# dsh plugin --profile web add yongle-dadian-dsh

dsh --profile web --dump-config   # 确认出现 "# == dsh-yongle-bundle" 层
dsh --profile web
```

> 若从 GitHub 安装,作者需提供 `prepare` 脚本;用户需在 profile 的
> `pnpm-workspace.yaml` 中 `allowBuilds` 授权构建。

## 能力一览

| 形态 | 名称 | 说明 |
|---|---|---|
| 模型工具 | `yongle_search` | 混合检索(关键词 + 语义 + RRF),紧凑输出,支持多级合并 |
| 模型工具 | `yongle_recall` | 思维模式/风格决策召回(默认项目级) |
| 模型工具 | `yongle_remember` | **记录知识**,显式指定级别(project/user/global) |
| 模型工具 | `yongle_status` | 知识库状态(全部级别条目数) |
| 人类命令 | `/yongle-search` | 终端侧检索(支持 `--level`) |
| 人类命令 | `/yongle-record` | **记录知识**(`--level project\|user\|global`, 广播会话持久化事件) |
| 人类命令 | `/yongle-postmortem` | **复盘蒸馏**:从当前会话事件日志提取素材 → LLM 生成草稿(待确认) |
| 人类命令 | `/yongle-confirm` | **确认归档**:草稿 → 正式条目 + 索引 + `ctx.jobs` 后台异步向量化 |
| 人类命令 | `/yongle-repair` | **向量库修复**:检测旧格式/过时 chunk;`--run` 可派发 `ctx.jobs` 后台任务重新嵌入 |
| 人类命令 | `/yongle-reindex` | 增量重建 SQLite 索引 |
| 人类命令 | `/yongle-status` | 状态看板 |
| 钩子(默认关) | `tools/post-execute` | 工具报错时即时注入已知方案提示(`[yongle hint]`), **直接杜绝同一轮次中盲目重试浪费 Token** |
| 钩子(默认关) | `agent/turn-stopping` | 回合关闭边界提示复盘蒸馏 |
| 生命周期 | `ctx.effect` | 插件卸载与 HMR 热重载时安全释放 SQLite 与 LanceDB 连接 |
| 信号控制 | `exec.signal` | 全链路透传 `AbortSignal`，长检索与 Embedding 网络请求随时可安全取消 |

## 安装与分发

- **本地开发**:`dsh plugin --profile web add ./dsh`(link 安装;源码目录需先 `pnpm install`)
- **tarball(已验证)**:`cd dsh && pnpm pack` → `dsh plugin --profile web add ./yongle-dadian-dsh-0.2.0.tgz`
- **npm(待发布)**:`npm publish` 后 `dsh plugin --profile web add yongle-dadian-dsh`

包为**自包含**分发:`scripts/sync-core.mjs` 将核心引擎同步进 `lib/`
(与 `lib/package.json` 的 `type: commonjs` 一起打包),`prepare` 脚本保证
git/npm 安装前自动同步。

## 复盘蒸馏(Postmortem)

`/yongle-postmortem` 与既有宿主命令不同,素材来源是 **DSH 结构化会话日志**
(`agent.session.events`),而非扫描自然语言上下文:

1. 提取最后用户请求、失败工具链(名称/参数/错误)、最终助手方案、轮次统计
2. **固定系统模板** + 紧凑素材(默认 < 2K 字符)→ LLM 蒸馏
   (模板字节级恒定 → 每次复盘调用的前缀都能命中 DeepSeek 缓存)
3. 生成带 `draft: true` 标记的六字段 frontmatter 草稿(存入 `<level>/drafts/`)
4. `/yongle-confirm <draft-path>` 确认 → 移除标记 → 正式 memory 目录 →
   增量索引(含正文索引)→ 后台向量化

蒸馏条目把"原始问题"写入正文,保证日后按原话复述的查询也能召回。

## 三级知识库

| 级别 | 含义 | 存储位置 |
|---|---|---|
| `project`(项目级) | 当前工作区专属,随项目 git 分享 | `<workspace>/.planning/yongle/` |
| `user`(用户级) | 个人跨项目经验 | `~/.yongle_knowledge/`(`YONGLE_HOME` 或 `storage.user_path` 可覆盖) |
| `global`(全局级) | 团队/机器共享 | `YONGLE_GLOBAL_HOME` 或 `storage.global_path` 指定;未配置则该级别禁用 |

- **检索**:`level: auto`(默认)按 project → user → global 三级合并检索,结果带
  `<level>` 标签;也可指定单级别。
- **记录**:`yongle_remember` 工具与 `/yongle-record` 命令**必须显式指定级别**
  (避免知识落错位置);条目写入对应级别 memory 目录 + SQLite 索引,并后台向量化。
- **CLI 兼容**:旧 `global` 位置参数在团队库未配置时自动回退用户级检索。

## Token 优化(利用 DeepSeek 前缀缓存)

DeepSeek API 自动缓存请求前缀,缓存命中 token 价格约为未命中的 1/10。本插件的设计:

1. **知识只经工具结果进入上下文** → 位于请求末尾,系统提示词与对话历史的前缀
   缓存完全不受影响(这是最大的节省来源)。
2. **输出紧凑**:默认 5 条,摘要 140 字符;`detail` 参数按需取全文。
3. **字节级确定性输出** + **结果缓存(TTL 可配,默认 10 分钟)**:相同查询重复调用
   返回完全一致的文本,且秒回、免重复 embedding API 调用。
4. **工具描述显式指导**模型:上下文已有答案时不要重复调用。
5. **Embedding 缓存**:查询向量内存 LRU + 磁盘缓存(沿用 `query_cache.json`)。
6. 复盘/沉淀类 LLM 调用使用**固定模板**的系统提示词,使每次调用的前缀可命中缓存。

## 配置(全部可选;缺省继承 `~/.yongle_knowledge/config.json`)

```yaml
- insert:
    - id: yongle
      name: yongle-dadian-dsh
      config:
        maxResults: 5
        snippetChars: 140
        autoPostmortem: false          # 回合内工具失败时自动注入检索提醒
        storage:
          global_path: D:\team-knowledge   # 团队共享知识库(启用 global 级别)
          # user_path: D:\my-knowledge     # 自定义用户级知识库位置
        embedding:
          provider: deepseek
          model: deepseek-embedding
          apiKey: !!js process.env.DEEPSEEK_API_KEY
```

## 性能特性

- **进程内 SQLite**(`node:sqlite`,FTS5 trigram):关键词检索 0-2ms,不再逐次
  spawn `sqlite3` 子进程
- **LanceDB 连接复用**:进程内二次查询跳过 connect/openTable 开销
- **并行检索**:关键词与语义检索并行,整体超时保护
- **优雅降级**:embedding 禁用/失败 → 纯 FTS 模式
- **增量索引**:首次使用自动扫描建库,之后按 mtime 只更新变更

## 已知限制

- `node:sqlite` 为 Node ≥22.5 内置实验特性(会在日志打印一次 ExperimentalWarning)
- 全局库中 4 个历史条目(2026-06-13 批次)的正文存在旧管线多跳编码错乱,机械恢复
  有损,暂保留原状(检索不受影响);已用 `/yongle-repair --run` 重建其向量分块
- `vectordb` 原生依赖较大,首次安装较慢(镜像网络下约 1-2 分钟)
