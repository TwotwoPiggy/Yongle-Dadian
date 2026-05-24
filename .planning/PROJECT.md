# AI Agent Skills 库 (永乐大典)

## What This Is

一个用于沉淀、扩展和管理 AI Agent (如 Antigravity, codex, trae, qoder 等) 协作能力的专属技能库。通过注入定制化的 Workflow 和被动触发任务，解决 AI 结对编程中重复采坑、上下文流失等问题，最终形成一套不断自我学习进化的“AI 伴生工具箱”。

## Core Value

让 AI Agent 在日常开发流程中能自主捕捉、学习并沉淀经验，彻底消除相同错误的重复发生和宝贵对话上下文的浪费。

## Current Milestone: v1.5 Upgrade

**Goal:** 实现 Yongle Dadian 的自更新机制，允许通过命令一键升级并重新注入最新技能。

**Target features:**
- 提供版本检查与获取最新版本的机制
- 实现一键更新逻辑 (支持 Git / NPM 模式)
- 更新完成后自动将最新的 Skills 与 Workflows 重新注入至大模型工作区

## Requirements

### Validated

- ✓ **构建技能库基础架构** — v1.0 MVP
- ✓ **支持全局和项目级别知识存储** — v1.0 MVP
- ✓ **多维索引与溯源机制 (SQLite)** — v1.0.5 Performance
- ✓ **Skill 1: 永乐大典 (Yongle Dadian)** — v1.0 MVP (Post-mortem & Active Watch)
- ✓ **Skill 2: 做梦 (Dreaming)** — v1.0 MVP
- ✓ **集成向量数据库引擎 (LanceDB)** — v1.1 Vector Search
- ✓ **Embedding API 接入 (Ollama/OpenAI)** — v1.1 Vector Search
- ✓ **混合检索 (Hybrid Search via RRF)** — v1.1 Vector Search
- ✓ **HTTP/HTTPS 代理配置与自动回退** — v1.3 Network Proxy Support
- ✓ **Embedding/Chat 代理路由重构** — v1.3 Network Proxy Support
- ✓ **多设备 Git 同步配置 (apiKeys 脱敏)** — v1.4 Multi-Device Sync
- ✓ **CLI 导入导出备份与 Dry-run 预览** — v1.4 Multi-Device Sync
- ✓ **多端知识同步与冲突解决加固** — v1.4 Multi-Device Sync

### Active

*(无)*

### Deferred (延后)

- [ ] **远程 Web 查看器**：原 v1.2 计划，建立安全的低开销后台 Viewer，提供优雅的 Web 查询界面。（延后至未来里程碑）

### Out of Scope

- [支持非代码/非开发相关的通用闲聊功能扩展] — 暂不考虑，当前聚焦在使用 AI Agent 进行**开发编程**的提效场景。
- [重型全功能管理后台] — 保持 local-first 与 Markdown-centric，绝不引入重型管理后台系统。

## Context

- **运行环境**: 深度协同主流 AI IDE (VS Code, Trae 等) 与命令行终端。
- **持久化方案**: 本地以 Markdown 文本为主，底层引入 SQLite 与 LanceDB 二维数据库引擎以提供极速 of 混合 FTS + 语义搜索。
- **并发机制**: 采用 Node.js 并发流程，支持首屏 FTS 瞬时返回 + 后台 Embedding 加载 + RRF 融合渲染机制，消除大模型向量查询的卡顿感。

## Constraints

- **零依赖性**: 数据库与向量存储必须为零外部进程依赖，全部以 local/embedded 形式加载（SQLite / LanceDB）。
- **非阻塞式**: 所有数据更新与向量生成必须完全在后台进行（Fire-and-forget），不可卡顿或阻塞用户的核心 IDE 交互。

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 采用 Markdown + SQLite 的混合索引存储 | Markdown 满足直观读写、Agent 最擅长处理；SQLite 用作扩展，支撑日后数据庞大时的高频查询 | ✓ Good |
| 混合主被动技能架构基座设想 | `永乐大典`重“人工适时插入与调控”，`做梦`重“自动化和无人值守监听”，因此基座需支持两套生命周期不同的任务。 | ✓ Good |
| RRF + 1.5x FTS Boost 混合检索 | 纯向量检索易受短词及语义偏斜干扰，结合 SQLite 倒排匹配并在 RRF 合并时对 FTS 乘以 1.5 倍提权，能确保精确命中与意图托底的完美统一。 | ✓ Good |
| 流式 CLI 更新（Streaming UI） | Embedding 生成和向量库查询有 0.5s~1.5s 延迟，先渲染 SQLite FTS 的结果打底，等语义结果到位后再用 ANSI 擦除并重绘结果，保证极佳交互体验。 | ✓ Good |
| 远程配置仅做本地脱敏传输且交互合并 | D-01/D-04：apiKey 字段永远只留在本地设备，在 push 前必须彻底脱敏。在 pull 时通过临时文件执行本地 `deepMerge` 并让用户确认，确保远程历史绝对干净。 | ✓ Good |
| 导入合并保留本地原有 API Key 字段 | 导入他人配置时，应当将其脱敏的结构与本地已存在的含有 `apiKey` 的配置合并，合并时保留本地原有的 `apiKey`，防止用户每次拉取同步都得重新输入 key。 | ✓ Good |

## Evolution

This document evolves at phase transitions and milestone boundaries.

---
*Last updated: 2026-05-24 after Milestone v1.4 Multi-Device Sync completion*
