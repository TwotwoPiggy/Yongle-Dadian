# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.5 — Upgrade

**Shipped:** 2026-05-24
**Phases:** 1 | **Plans:** 1 | **Sessions:** 1

### What Was Built
- **双轨自更新系统**：基于 `.git` 检测实现开发模式（Git 远程 fetch & 分支 commit 落后数对比）与包模式（npm view 注册表最新版对比）双轨更新。
- **智能依赖下载控制**：在更新前后通过 crypto 模块对 `package-lock.json` 执行 MD5 哈希校验，仅当依赖结构变化时触发 `npm install`。
- **自动技能重注入**：遍历主流 Agent 运行时的配置目录，智能检测已安装的凭证（install-manifest.json），拉取最新代码后自适应重注入所有对应技能。
- **安全失败自愈**：在更新拉取前自动记录 HEAD Commit 快照，出现外部或网络异常中断时能够捕获错误并执行 `git reset --hard` 自愈恢复。

### What Worked
- **冒烟自愈测试**：在交互式 UAT 期间，主动通过模拟人工错误跑了一遍崩溃测试，脚本成功回滚并将用于测试的人工代码一并擦除，完美自愈。这证明了保护机制在极端网络问题下保障开发树清洁的能力。
- **配置一致性补齐**：在注册器中补充注册了先前的 `yongle-config-export` 和 `yongle-config-import`，并同步了其在源码库中的 `skills/` 缺失文件，堵住了未来的技能丢失漏洞。

### What Was Inefficient
- 项目早期的 `commands` 文件夹在 `bin/install.js` 中虽然定义了 `srcCommands`，但始终未在实际安装时进行拷贝，增加了命令定义的阅读摩擦。不过由于其主要用于 CLI 解析或作为文档资产，目前影响极小。

### Patterns Established
- **Hash-based conditional commands**：对于耗时过长的依赖安装（如 `npm install`），通过对比 package-lock.json 文件哈希 MD5 来决定是否跳过，极大地提高了自更新速度。

### Key Lessons
1. **测试驱动自愈**：在构建任何含有 `git reset --hard` / `git pull` 等破坏性或网络高度依赖的命令时，必须将错误捕获后的恢复逻辑作为第一公民进行冒烟测试，以防用户真实机器的文件受损。
2. **凭证隔离与追踪**：通过 `install-manifest.json` 在各运行时做隔离式的版本和状态记录，使得宿主脚本不需要在运行时知道繁琐的全局环境变量，解耦了检测重注入和安装器的依赖。

### Cost Observations
- Model mix: 100% Gemini 3.5 Flash
- Sessions: 1
- Notable: Gemini 3.5 Flash 高速的响应及精密的逻辑控制在这个简单的单 wave 升级里程碑中表现出了极高的效能。

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.5 | 1 | 1 | 建立以测试和 UAT 验证为核心的交付闭环，对回退与错误自愈执行了人工抛错级别的白盒测试。 |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|----------|--------|-------------------|
| v1.5 | 4 | 100% | 0 |
