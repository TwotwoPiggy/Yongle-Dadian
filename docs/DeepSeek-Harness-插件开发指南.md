# DeepSeek Harness 原生插件开发指南

> 本文整理自 DeepSeek Harness 官方开发文档（简体中文版，`docs/user/develop/**` 与 `docs/**` 目录）。
> 官方站点：<https://deepseek-harness.github.io/deepseek-harness/> · 仓库：<https://github.com/deepseek-ai/deepseek-harness>
> 适用对象：想为 DeepSeek Harness 编写"原生插件"（即直接以 TypeScript 编写的 Cordis 插件，而非 MCP 外部工具或 Python SDK 客户端）的开发者。

---

## 目录

- [0. 文档地图：官方文档怎么读](#0-文档地图官方文档怎么读)
- [1. 核心概念：插件、上下文与 Cordis](#1-核心概念插件上下文与-cordis)
- [2. 第一个插件（快速上手）](#2-第一个插件快速上手)
- [3. 开发一个 Tool（工具）](#3-开发一个-tool工具)
- [4. 插件配置（Config 与 Schemastery）](#4-插件配置config-与-schemastery)
- [5. 插件生命周期（Fiber 状态机）](#5-插件生命周期fiber-状态机)
- [6. 服务与依赖](#6-服务与依赖)
- [7. 事件系统](#7-事件系统)
- [8. 打包与安装（bundle / profile）](#8-打包与安装bundle--profile)
- [9. 实战模式一：三种角色的能力设计（seam）](#9-实战模式一三种角色的能力设计seam)
- [10. 实战模式二：LLM 适配器](#10-实战模式二llm-适配器)
- [11. 扩展形态速查（钩子 / UI / 协议驱动）](#11-扩展形态速查钩子--ui--协议驱动)
- [12. 在仓库中新增一个包（checklist）](#12-在仓库中新增一个包checklist)
- [13. 功能 → 机制映射表](#13-功能--机制映射表)
- [14. 官方文档完整索引](#14-官方文档完整索引)

---

## 0. 文档地图：官方文档怎么读

官方文档分三大块：

| 板块 | 内容 | 路径 |
|---|---|---|
| **入门 Guide** | 用 Web UI、配置模型、Python SDK | `/guide/*` |
| **开发 Develop**（本指南主体） | 基础（第一个插件、Tool、配置、打包）→ 框架（生命周期、服务、事件）→ 实战（能力分层、LLM 适配器）→ Cordis 教程（7 章） | `/develop/*` |
| **参考 Reference** | 架构、Cordis 入门、能力服务、Agent 生命周期、Tool 执行、生成的配置/Tool/事件目录、Cordis API、实操手册（cookbook）、子系统 | `/reference/*` |

**推荐的阅读路线**（对应本指南章节）：

1. 本指南 1–2 章 → 官方《第一个插件》：<https://deepseek-harness.github.io/deepseek-harness/develop/basic/>
2. 本指南 3–4 章 → 《开发一个 Tool》《插件配置》
3. 本指南 5–7 章 → 《插件与生命周期》《服务与依赖》《事件系统》
4. 本指南 8 章 → 《打包与安装插件》
5. 本指南 9–11 章 → 实战与 cookbook
6. 进阶：《Cordis 框架教程》（7 章，动手搭出同一套运行时，不需要 API 密钥）：<https://deepseek-harness.github.io/deepseek-harness/develop/cordis-tutorial/>

---

## 1. 核心概念：插件、上下文与 Cordis

### 1.1 Harness 的一切都是插件

DeepSeek Harness（下文简称 dsh）的底层插件框架是 **Cordis**（以 vendor 方式引入）。核心论断：

> **产品的每一部分都是插件**——模型适配器、工具注册表、会话日志、agent loop 本身，全部是插件，因此每一部分都可以从配置替换。**不存在需要打补丁的特权内核**：扩展 dsh 的方式就是把插件挂载到其他插件旁边，所有注册都是可撤销的副作用。

### 1.2 五个核心概念（来自 Cordis 入门）

1. **插件是实现 Service 的对象。** 可以是一个带可选 `inject` 和 `apply(ctx)` 字段的函数，也可以是一个 `Service` 子类。
2. **上下文（Context）是服务的容器。** 一个服务占据一个稳定的 `ctx.<key>`（如 `ctx.tools`、`ctx.llm`、`ctx.sessions`）；其他插件通过 key 查找服务，而不是 import 具体实现。
3. **通过 `inject` 声明服务依赖。** 插件声明所需服务后，会**等待这些服务就绪才启动**；加载顺序通过依赖表达，而非手动编排启动序列。
4. **类型化事件用于通信。** 通过 TypeScript 声明合并注册事件名，以 `emit` / `waterfall` / `parallel` / `serial` 分发。
5. **注册是可逆的副作用。** 提示词片段、工具 schema、适配器、提供方、监听器通过 `ctx.effect()` 或 `ctx.on()` 安装，reload 与 teardown 时自动撤销。

### 1.3 插件的最小形态

一个插件就是一个导出 `apply` 函数的 TypeScript 模块：

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'my-plugin'

export function apply(ctx: Context) {
  // Register capabilities here.
}
```

### 1.4 插件的三种形态

| 形态 | 适用场景 |
|---|---|
| **函数形式** `export function apply(ctx)` | 大多数情况足够 |
| **对象形式** `export default { name, inject, apply }` | 需要声明 `inject` 依赖时更清晰 |
| **类形式** `export default class X extends Service` | 需要向其他插件**提供服务**时使用 |

```ts
// 对象形式
import type { Context } from '@deepseek-ai/cordis'

export default {
  name: 'my-plugin',
  inject: ['tools'],
  apply(ctx: Context) {
    // ...
  },
}
```

```ts
// 类形式
import { Service, type Context } from '@deepseek-ai/cordis'

export default class MyService extends Service {
  static inject = ['tools']

  constructor(ctx: Context) {
    super(ctx, 'myService')
    // 在构造函数中做同步初始化
  }
}
```

### 1.5 实践规则（两条铁律）

- **每个注册都要有对应的 disposer（清理函数）**：要么从 `ctx.effect()` 返回一个，要么用 Cordis 提供的辅助方法自动处理。如果 teardown 顺序有要求，把相关工作放在**同一个** effect 中。
- **拦截与策略优先用事件，直接能力调用优先用服务方法**：工具流水线事件属于 `ctx.tools`，模型流式输出属于 `ctx.llm`，实时 agent 协调属于 `ctx.agents`。

---

## 2. 第一个插件（快速上手）

前提：已按 README 从源码运行起 dsh（`pnpm dsh web`），Web UI 可访问 `http://127.0.0.1:3080`。

### 2.1 创建项目与插件文件

```sh
mkdir -p scratch-plugin/src
```

创建 `scratch-plugin/src/my-plugin.ts`：

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'hello-plugin'

export function apply(ctx: Context) {
  // Required dependencies are ready before apply runs.
  console.log('[hello-plugin] plugin loaded!')
}
```

### 2.2 用 patch 覆盖层注册本地插件

在仓库根目录运行 `pwd` 拿到绝对路径，创建 `scratch-plugin/cordis.yml`：

```yaml
- insert:
    - id: hello
      name: '/absolute/path/to/deepseek-harness/scratch-plugin/src/my-plugin.ts'
```

> 插件路径**必须是绝对路径**。patch 文件只贡献配置，不会改变 loader 解析模块路径时使用的 profile 目录。

启动：

```sh
pnpm dsh web --patch ./scratch-plugin/cordis.yml
```

打开 `http://127.0.0.1:3080`，终端会打印 `[hello-plugin] plugin loaded!`。

### 2.3 自动清理

通过 `ctx` 注册的**任何东西**——事件监听、工具、定时器——在插件卸载时都会被自动清理，无需手动 removeListener / clearInterval。需要手动清理的资源用 `ctx.effect()` 声明：

```ts
import type { Context } from '@deepseek-ai/cordis'

export function apply(ctx: Context) {
  ctx.effect(() => {
    const timer = setInterval(() => {
      console.log('heartbeat')
    }, 5000)

    // 插件卸载时执行
    return () => clearInterval(timer)
  })
}
```

### 2.4 声明依赖

插件需要使用其他服务（如 `tools`、`llm`）时声明 `inject`，框架会保证依赖就绪后才执行 `apply`：

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'my-tool-plugin'
export const inject = ['tools']

export function apply(ctx: Context) {
  // ctx.tools is ready here.
  ctx.tools.register(/* ... */)
}
```

---

## 3. 开发一个 Tool（工具）

工具是模型可调用的能力，在 `ctx.tools` 上注册。官方教程：<https://deepseek-harness.github.io/deepseek-harness/develop/basic/tool>；完整约定以《工具编写参考》为准：<https://deepseek-harness.github.io/deepseek-harness/reference/cookbook/adding-a-tool>。

### 3.1 最小形态

```ts
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'greet-tool'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'greet',
    description: 'Greet someone by name.',          // 模型看到什么
    parameters: {
      name: { type: 'string', required: true, description: 'The name to greet' },
    },
    output: {
      schema: { type: 'string' },                   // 规范返回值的类型
      render: (_args, value) => [{ type: 'text', text: value }],  // 转为模型可见内容
    },
    async execute(args) {
      return `Hello, ${args.name}!`
    },
  }))
}
```

- `defineTool` 根据 `parameters` **推导并校验** `args` 类型（`execute` 里 `args` 是类型安全的）。
- `execute` 返回 `output.schema` 声明的**规范值**（canonical value）；`output.render` 把规范值转换成模型可见的内容块。
- 注册基于副作用：dispose 插件 fiber 即注销该工具；schema 自动流入系统提示词的组装过程。

运行后对 Web UI 输入 `Use the greet tool to greet Ada.`，模型即可调用 `greet` 并收到 `Hello, Ada!`。

### 3.2 `execute()` 的规则（要点）

- **参数已为你校验。** `defineTool` 在 `execute` 前根据 `ParameterSchemaSpec` 校验模型生成的 `arguments`（类型、必填键、字面量约束、联合分支、嵌套值）。显式对象节点必须声明 `additionalProperties: true | false`。schema DSL 表达不了的约束（非空字符串、正数、跨字段规则）仍要自己检查。
- **执行身份受保护。** 注册表会把 `arguments` 物化为分离的无损 JSON，分配不透明的 `exec.token`；`exec` 上的 `callId`、`name`、`arguments`、`agent`、`token`、`signal` 在整个分发过程中不可变。请把 `args` 视为只读输入。
- **声明并返回一个规范 JSON 值。** `output.schema` 根可以是对象/数组/标量/null。`execute` 只返回推导值；不要返回内容块，也不要让调用方从自然语言里解析 id 和字段。
- **抛异常或返回无效值 ⇒ `isError`。** 基础设施故障抛异常；成功的领域结果即使状态不理想，也应写入规范值（例如进程非零退出）。
- **遵守 `exec.signal`。** 信号触发时取消进行中的工作。
- **用 `output.presentationMeta(args, value)` 投影可回放的 UI 卡片数据（可选）。** 需要结果期事实的卡片（如 `write`/`edit` 的 hunk）靠它，无需持久化规范值。
- **用 `exec.agent` 发送异步通知。** `agent.inject({ content, source: { kind: 'plugin', plugin: '<name>' } })` 追加持久化上下文，下一次模型请求会看到它（不唤醒空闲 agent，注意 try/catch 防已 dispose）。

### 3.3 长时间运行的工作

- 通过 producer 配置 `run_in_background`，然后用 `ctx.jobs.start({ kind, label, owner: exec.agent, run })` 注册后台任务。
- producer 提供同步 `cancel`、settle 不 reject 的 `done`、可选的消费式 `readOutput`。
- 发布 job 后应使用**任务自有的取消信号**而非 `exec.signal`：之后取消外层调用只停止等待，不终止已发布的 job（生命周期归 `job_kill`、owner dispose 和服务 teardown）。
- 成功的后台分支返回类型化句柄，如 `{ kind: 'background', jobId }`；Code Mode 绝不能靠解析渲染文本取 id。

### 3.4 执行策略与观测（不要内建策略到工具）

| 扩展点 | 用途 |
|---|---|
| `tools/pre-execute` | 允许/拒绝/询问的扩展策略门禁（waterfall，返回类型化决策） |
| `ctx.tools.guard()` | 设置**单调最终拒绝**，后续监听器无法撤销 |
| `tools/execute` | 为分发加截止时间、重试、指标（可替换 `exec.signal`） |
| `tools/post-execute` | 替换展示内容或返回值、阻止结果、附加模型可见上下文 |
| `tools/result` | 观测不可变的归一化结果，不改变它 |

### 3.5 工具在 UI 中的渲染（两类输出分开）

- **模型可见内容** → `output.render`（自然语言）。
- **UI 卡片** → 独立的纯展示投影 `presentCall(args)`（PENDING 卡）与 `presentResult(args, { content, isError, meta? })`（完成卡）。

卡片类型：`generic`（默认）、`terminal`（shell 命令，tool-bash）、`diff`（改文件，tool-fs `write`/`edit`）、`search`（grep/glob 发现型结果）、`web`（web 检索）。

硬性规则：展示方法必须是 `args`（+ result）的**纯函数**——不做 I/O、不读会话状态、不用时钟/随机数；UI 格式（` ```console ` 围栏、diff、相对路径）绝不进入规范值或模型内容；展示失败只能回退（`undefined` → 通用卡），绝不能让回放崩溃。

### 3.6 Code Mode 自动触达你的工具

每个可见的已注册工具都可通过 `await tools.<name>(args)` 调用，无需额外集成。成功解析为策略处理后的最终规范 JSON 值；失败以真正的 `ToolCallError` reject。

---

## 4. 插件配置（Config 与 Schemastery）

官方教程：<https://deepseek-harness.github.io/deepseek-harness/develop/basic/config>

### 4.1 定义 Config 类型与 schema

导出 `Config` 类型和同名 Schemastery schema，默认值直接写在 schema 中：

```ts
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

export const name = 'my-plugin'

export interface Config {
  greeting: string
  maxRetries: number
  verbose?: boolean
}

export const Config: Schema<Config> = Schema.object({
  greeting: Schema.string().default('Hello'),
  maxRetries: Schema.number().default(3),
  verbose: Schema.boolean().default(false),
})

export function apply(ctx: Context, config: Config) {
  console.log(config.greeting)  // 用户值或 schema 默认值
}
```

在 patch 中传配置：

```yaml
- insert:
    - id: hello
      name: './src/my-plugin.ts'
      config:
        greeting: 'Hi there'
        maxRetries: 5
```

> 不要导出普通对象作为 `Config`——它不满足 Cordis 要求的 Standard Schema 接口。Schema 在插件加载时校验，配置不合法则加载失败并给出明确错误。

### 4.2 严格校验示例

```ts
export const Config = Schema.object({
  apiKey: Schema.string().required(),
  timeout: Schema.number().default(30000),
  mode: Schema.union(['fast', 'accurate']).default('fast'),
})
```

### 4.3 设计原则

1. **无硬编码可调参数**：凡是不同部署可能需要不同值的参数，都必须定义为配置字段。检验标准：能否在 `cordis.yml` 中改变这个值而不改代码？
2. **配置错误要响亮**：在 schema 中表达自身完备的约束，使无效配置在插件加载时失败。对服务或已注册资源的引用需要依赖注入（见第 6 章）。
3. **配合 HMR**：修改 `cordis.yml` 中某个插件的 `config` 会触发插件热替换（卸载旧实例 → 加载新实例），旧注册不会残留。

---

## 5. 插件生命周期（Fiber 状态机）

官方教程：<https://deepseek-harness.github.io/deepseek-harness/develop/framework/>

### 5.1 状态机

每个被加载的插件拥有一个 **Fiber** 作用域：

```
PENDING → LOADING → ACTIVE
                 ↘ FAILED
ACTIVE → UNLOADING → DISPOSED
```

| 状态 | 含义 |
|---|---|
| PENDING | 已声明，但所需依赖未就绪 |
| LOADING | 依赖就绪，正在执行 `apply` |
| ACTIVE | 插件运行中 |
| FAILED | `apply` 抛出异常 |
| UNLOADING | 正在卸载并释放资源 |
| DISPOSED | 已完全卸载 |

### 5.2 依赖驱动的加载

声明 `inject` 的插件等待所有必需服务就绪后才执行 `apply`。**如果依赖的服务消失**（例如提供方被替换），插件自动卸载（ACTIVE → DISPOSED），服务恢复后重新加载。

### 5.3 自动清理

以下操作都会被自动追踪并在卸载时撤销：

- `ctx.on(event, handler)` — 事件监听
- `ctx.tools.register(tool)` — 工具注册
- `ctx.llm.registerAdapter(names, adapter)` — LLM 适配器注册
- `ctx.effect(() => cleanup)` — 自定义资源

> 卸载时，处置器按注册顺序**逆序**开始调用，但多个异步处置器**并发**执行，不保证逐个完成。存在顺序依赖的清理步骤必须放进同一个 `ctx.effect()` 返回的处置器中串行等待。

### 5.4 嵌套上下文与手动 dispose

```ts
export function apply(ctx: Context) {
  ctx.plugin(childPlugin)   // 子插件，独立 Fiber，随父卸载
}

const fiber = ctx.plugin(myPlugin)
await fiber.dispose()       // 手动提前终止
```

`dispose` 保证：① 该插件所有注册被移除；② 子插件被递归卸载；③ Promise 在所有异步清理完成后兑现。

### 5.5 HMR（热模块替换）

通过 `cordis.yml` 加载 `@deepseek-ai/cordis-plugin-hmr` 后，修改插件源文件会触发：卸载旧插件（清理所有注册）→ 重新加载新代码 → 执行新的 `apply`。

---

## 6. 服务与依赖

官方教程：<https://deepseek-harness.github.io/deepseek-harness/develop/framework/service>

### 6.1 什么是服务

服务是挂载在 `ctx` 上的命名能力。`tools`、`llm`、`agents` 都是服务。**任何插件都可以提供服务**，供其他插件使用。

```ts
ctx.tools    // ToolRuntime service
ctx.llm      // LLM service
ctx.agents   // Agent service
```

### 6.2 使用服务：inject

```ts
export const inject = ['tools']

export function apply(ctx: Context) {
  // ctx.tools exists and is ready here.
  ctx.tools.register(/* ... */)
}
```

### 6.3 提供服务：Service 基类

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

export default class MetricsService extends Service {
  static inject = ['llm']  // 服务可以依赖其他服务

  constructor(ctx: Context) {
    super(ctx, 'metrics')  // 'metrics' 是服务名
  }

  record(event: string, value: number) {
    // ...
  }
}
```

消费方：

```ts
export const inject = ['metrics']

export function apply(ctx: Context) {
  ctx.metrics.record('tool_call', 1)
}
```

### 6.4 类型声明（声明合并）

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    metrics: MetricsService
  }
}

export default class MetricsService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'metrics')
  }
  record(event: string, value: number) { /* ... */ }
}
```

### 6.5 必需依赖 vs 可选依赖

```ts
// 必需：服务缺席时插件不加载
export const inject = ['tools']

// 可选：省略 inject，在使用点用 ctx.get() 查询
export function apply(ctx: Context) {
  const metrics = ctx.get('metrics')
  metrics?.record('plugin_loaded', 1)
}
```

**服务消失时的行为**：应用运行期间必需服务消失 → 依赖它的插件自动 dispose；服务重新出现 → 自动重新加载。防止插件调用已不存在的服务。

### 6.6 服务隔离（同一个服务多个实例）

`cordis.yml` 用 `cordis-plugin-group` + `isolate` 让不同插件组看到不同的服务实例：

```yaml
- id: group-a
  name: '@deepseek-ai/cordis-plugin-group'
  group: true
  isolate:
    shell: true
  config:
    - name: '@deepseek-ai/dsh-bash-local'
      config:
        timeoutMs: 5000
    - name: './src/plugin-a.ts'

- id: group-b
  name: '@deepseek-ai/cordis-plugin-group'
  group: true
  isolate:
    shell: true
  config:
    - name: '@deepseek-ai/dsh-bash-local'
      config:
        timeoutMs: 60000
    - name: './src/plugin-b.ts'
```

`plugin-a` 与 `plugin-b` 各自看到组内的 Bash 实例，互不影响。

### 6.7 内置服务清单

服务名、公开方法与源码位置由仓库自动生成到各**子系统页面**（如 `core`、`tools`、`llm-streaming`、`session` 等）。开发插件时以这些生成的 `cordis-surface` 区块和服务的 TypeScript 接口为准，**不要维护另一份静态清单**。

---

## 7. 事件系统

官方教程：<https://deepseek-harness.github.io/deepseek-harness/develop/framework/events>

事件是 Cordis 插件间通信的核心机制，也是 Harness 松耦合扩展点的主要载体。

### 7.1 基本用法

```ts
ctx.on('event-name', (payload) => { /* ... */ })   // 监听
ctx.emit('event-name', payload)                    // 触发
```

### 7.2 四种分发模式（事件公开约定的一部分）

| 模式 | 是否 await | 分发顺序 | 是否有返回值 | 用途 |
|---|---|---|---|---|
| `emit` | 否 | 按注册顺序观察 | 否 | 广播通知 |
| `waterfall` | 否（返回值异步则 await） | 按注册顺序观察 | 是 | 环绕中间件/流水线 |
| `parallel` | 是 | 全部并行 | 否 | 并行扇出 |
| `serial` | 是 | 按注册顺序观察 | 是 | 按序执行，首个非空结果短路 |

```ts
// emit — 广播
ctx.emit('my-plugin/ready', { id: 'worker-1' })
ctx.on('my-plugin/ready', ({ id }) => console.log(`${id} is ready`))

// bail — 短路（第一个非 null/false/undefined 的返回值成为最终结果）
const result = ctx.bail('some-check', input)

// serial — 顺序执行，等待异步结果，首个非空返回值终止后续
await ctx.serial('setup-phase', context)
```

**waterfall 语义（最重要，也是坑最多的地方）**：监听器接收 `(...args, next)`，**必须调用 `next()`** 委托给下游；下游返回值通过 `next()` 回到当前包装层，可包装后继续向外返回。**不调用 `next()` 直接返回即短路流水线**——这是故意设计，用于实现拦截/网关逻辑。

```ts
// 监听器：包装下游
ctx.on('my-plugin/transform', async (_input, next) => {
  const downstream = await next()
  return downstream.trim()
})
```

协作式监听器通常修改共享的请求/决策对象再委托；有决策权的策略监听器可以短路直接返回，仅做观察的监听器必须委托。只有必须排在普通注册之前运行时才用 `prepend: true`。

### 7.3 类型安全的事件

```ts
import '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Events {
    'my-plugin/ready': (payload: { id: string }) => void
    'my-plugin/check': (input: string) => boolean | undefined
    'my-plugin/transform': (input: string, next: () => Promise<string>) => Promise<string>
  }
}
```

### 7.4 事件命名与两类事件的区别

- Harness 的 Cordis 事件遵循 `namespace/action` 命名，例如 `agent/step`、`agent/request`、`agent/request-error`、`tools/result`、`session/event`。
- **注意**：`turn/*`、`step/*`、`tool/call`、`tool/result`、`compaction/*` 是**持久化的会话事件类型**，不是同名 Cordis 事件。要观察它们，监听 `session/event` 并检查 `event.type`。
- 完整签名与触发模式见子系统页面上生成的 `cordis-surface` 区块（如 `docs/subsystems/core.md`）。

### 7.5 监听器也是效果

`ctx.on()` 注册的监听器在插件卸载时自动移除。示例：工具日志插件

```ts
import type { Context } from '@deepseek-ai/cordis'
import '@deepseek-ai/dsh-tools'

export const name = 'tool-logger'

export function apply(ctx: Context) {
  ctx.on('tools/result', (exec, result) => {
    console.log(`[tool] ${exec.name}(${JSON.stringify(exec.arguments)})`)
    const text = result.content
      .map(block => block.type === 'text' ? block.text : '')
      .join('')
    console.log(`[tool result] ${text.slice(0, 100)}`)
  })
}
```

---

## 8. 打包与安装（bundle / profile）

官方教程：<https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish>

### 8.1 两个概念，两种 manifest

| 概念 | 是什么 | manifest 键 | 回答的问题 |
|---|---|---|---|
| **组合包（bundle）** | 附带一个配置层的 npm 包 | `dsh.bundle`（指向 patch 文件） | "这个包贡献什么？" |
| **profile** | `$DSH_HOME/profiles/<name>` 下、描述一份可启动组合的目录 | `dsh.profile`（有序 bundles 列表） | "这套配置由哪些包按什么顺序组成？" |

组合包是你编写并分发的东西；profile 是用户用 `dsh --profile <name>` 启动的东西。**没有东西同时是两者。**

### 8.2 组合包的结构

```
hello-plugin/
├── package.json       # 声明 dsh.bundle
├── cordis.patch.yml   # profile 列出该包时应用的层
└── index.js           # patch 行引用的插件模块
```

```json
{
  "name": "dsh-hello-plugin",
  "version": "0.1.0",
  "type": "module",
  "main": "index.js",
  "files": ["index.js", "cordis.patch.yml"],
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

```js
export const name = 'hello-plugin'
export function apply() {
  console.log('[hello-plugin] plugin loaded!')
}
```

```yaml
# cordis.patch.yml — 与 --patch overlay 同格式；区别是按包名引用，Node 才能解析已安装代码
- insert:
    - id: hello
      name: dsh-hello-plugin
```

> 没有 `dsh.bundle` 声明的包仍可安装，但只作为普通依赖：`dsh plugin` 会打印警告且不激活任何层。供插件包 import 的库就用这种格式。

### 8.3 安装进 profile

```sh
dsh plugin --profile demo add ./hello-plugin
```

首次使用会初始化 profile（`@deepseek-ai/dsh-base` 作为第一个组合包），pnpm 链接该 checkout，`dsh` 把它追加进 `dsh.profile.bundles`：

```json
{
  "name": "dsh-profile-demo",
  "private": true,
  "dependencies": { "dsh-hello-plugin": "link:/path/to/hello-plugin" },
  "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "dsh-hello-plugin"] } }
}
```

验证与启动：

```sh
dsh --profile demo --dump-config   # 显示 "# == dsh-hello-plugin" 层
dsh --profile demo
dsh plugin --profile demo remove dsh-hello-plugin   # 移除依赖和对应层
```

### 8.4 加载顺序（后应用者按行胜出）

生效配置在空根之上逐层组合：

1. profile 的 `dsh.profile.bundles` 所列各组合包 patch（先 `@deepseek-ai/dsh-base`，再按加入顺序）
2. profile 自己的 `cordis.patch.yml`
3. home 级 `$DSH_HOME/cordis.patch.yml`（各 profile 共享的机器本地偏好）
4. 每个 `--patch <path>` overlay，按 argv 顺序

**关键语义**：patch 按 `id` 定位某行并**替换该行整个 `config` 值**，不是深度合并各键。推论：

- 你的 patch 覆盖前面各层的行时，必须**重述该行需要的每一个键**。
- 用户可以在自己 profile 的 patch 中覆盖你的行，所以**优先给出用户大概率保留的配置默认值**，其余交给 schema。

内置组合包始终从 dsh 安装目录本身解析；pnpm 只管理树外依赖，你的组合包可以放心依赖 `@deepseek-ai/dsh-base` 存在。

### 8.5 从 GitHub 安装的坑：构建脚本

```sh
dsh plugin --profile demo add github:you/hello-plugin
```

git 安装拉取的是**源码，不是构建产物**，且**没有任何环节运行 `build` 脚本**。两边各需做一件事：

- **作者**：提供 `prepare` 脚本（pnpm 在 git 安装后运行），从源码构建出发布入口，且必须自包含（不能假设 monorepo checkout 等仅开发环境才有的上下文）。参考 [turtle-ui](https://github.com/deepseek-harness/turtle-ui)。
- **用户**：为构建授权。pnpm ≥10 默认拒绝运行 git 依赖的 `prepare` 脚本，第一次 `add` 会失败；把 pnpm 打印的包键复制进 profile 的 `pnpm-workspace.yaml` 后重试：

  ```yaml
  allowBuilds:
    dsh-hello-plugin: true
  ```

  > ⚠️ 这是允许该包代码在安装时于你机器上执行，**不在 agent 沙箱之内**。只对源码可信的包授权，并锁定 commit（`github:you/hello-plugin#<sha>`）。

不想让用户授权就分发构建产物：**发布到 npm**（`pnpm publish` 时构建好 `lib/`），或交付 **tarball**（`pnpm pack` 后 `dsh plugin add ./hello-plugin-0.1.0.tgz`）。

### 8.6 让表层组合包持有自己的命令行（进阶）

- 组合包挂载一个普通提供方插件（`name: 'dsh-hello-plugin/startup'`），导出 `inject = ['cmdlineArgs']`，用 `@deepseek-ai/dsh-cmdline` 的 `parseCmdline` 解析自己的 commander program，在 action 中把应用自有服务提供出去。
- 受参数配置的行注入该提供方服务，并在 `!!js` 选项中读取它，旁边写回退值：

  ```yaml
  - id: my-app
    name: '@example/my-app'
    inject: [myAppStartup]
    config:
      port: !!js ctx.myAppStartup.port ?? 8080
  ```

- 遇到 `--help` 时提供方不发布服务，这些行不会激活。

---

## 9. 实战模式一：三种角色的能力设计（seam）

官方教程：<https://deepseek-harness.github.io/deepseek-harness/develop/practice/>

当一个能力足够通用、需要支持可替换的提供方时（例如 Bash 执行），Harness 区分三种角色：

- **Service Definition**（定义包）：定义 Cordis 服务以及请求/结果类型
- **Service Provider**（提供方包）：实现该服务（如本地执行）
- **Consumer**（消费方包）：把该能力公开为模型可调用的工具

以 Bash 为例：

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────┐
│  dsh-shell   │────▶│  dsh-bash-local  │     │ dsh-tool-bash│
│(definition) │     │    (provider)     │     │ (consumer/tool)│
└─────────────┘     └──────────────────┘     └──────────────┘
       ▲                                            │
       └────────────────────────────────────────────┘
                    inject: ['shell']
```

**拆分的好处**：提供方可替换（换一行 cordis.yml 即换实现）、独立演进、依赖解耦（Provider 与 Consumer 互不依赖，都只依赖 Definition）。当前内置系列及其包链接见《能力 Seams 与核心服务》：<https://deepseek-harness.github.io/deepseek-harness/reference/capability-seams>

### 9.1 教程：三步实现

**第一步：Service Definition**

```ts
// packages/my-cap/my-cap/src/index.ts
import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    myCap: MyCapService
  }
}

export abstract class MyCapService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'myCap')
  }
  abstract execute(request: MyCapRequest): Promise<MyCapResult>
}

export interface MyCapRequest { input: string }
export interface MyCapResult { output: string }
```

**第二步：Service Provider**

```ts
// packages/my-cap/my-cap-local/src/index.ts
import type { Context } from '@deepseek-ai/cordis'
import { MyCapService, type MyCapRequest, type MyCapResult } from '@deepseek-ai/dsh-my-cap'

class MyCapLocal extends MyCapService {
  async execute(request: MyCapRequest): Promise<MyCapResult> {
    return { output: request.input.toUpperCase() }
  }
}

export const name = 'my-cap-local'

export function apply(ctx: Context) {
  ctx.plugin(MyCapLocal)
}
```

**第三步：Consumer（工具）**

```ts
// packages/my-cap/tool-my-cap/src/index.ts
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'tool-my-cap'
export const inject = ['tools', 'myCap']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'my_cap',
    description: 'Execute my capability.',
    parameters: { input: { type: 'string', required: true } },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      const result = await ctx.myCap.execute({ input: args.input })
      return result.output
    },
  }))
}
```

**在 cordis.yml 中组合**：

```yaml
- name: '@deepseek-ai/dsh-my-cap-local'
- name: '@deepseek-ai/dsh-tool-my-cap'
```

### 9.2 设计要点

- **不要预防性拆分**：只有角色需要独立演进时才拆成不同包；简单工具插件无需拆分。
- **Service Definition 拥有 Request/Result 类型**，Provider 与 Consumer 只依赖 Definition 包。
- **显式优于隐式**：默认值处理应通过显式的 `resolve(request): Spec` 步骤，而不是在 `run()` 里藏 `?? default`。

---

## 10. 实战模式二：LLM 适配器

官方教程：<https://deepseek-harness.github.io/deepseek-harness/develop/practice/llm-adapter> · 参考实现：`packages/llm/llm-deepseek`（直接 HTTP + SSE）与 `packages/llm/llm-pi-ai`（封装 LLM 库）。

### 10.1 最小实现

LLM 适配器 = 继承 `LlmAdapter` 并实现 `stream()` 的类，把 Harness 的提供方无关请求转成具体 API 调用，再把响应转回 Harness 分片：

```ts
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { LlmAdapter, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'

class MyAdapter extends LlmAdapter {
  private apiKey: string

  constructor(apiKey: string) {
    super()
    this.apiKey = apiKey
  }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    // 1. Convert options.messages to the provider format.
    // 2. Call the streaming API.
    // 3. Convert the response into StreamChunk values.
  }
}

export interface Config {
  apiKey: string
  providers: string[]
}

export const Config: Schema<Config> = Schema.object({
  apiKey: Schema.string().required(),
  providers: Schema.array(Schema.string()).required(),
})

export const name = 'my-llm-adapter'
export const inject = ['llm']

export function apply(ctx: Context, config: Config) {
  const adapter = new MyAdapter(config.apiKey)
  ctx.llm.registerAdapter(config.providers, adapter)
}
```

### 10.2 StreamChunk 协议（必须遵守）

```ts
import { CallId, type StreamChunk } from '@deepseek-ai/dsh-llm'

async function* exampleChunks(): AsyncIterable<StreamChunk> {
  // 1. 每个内容块以 block-start 开始
  yield { type: 'block-start', index: 0, blockType: 'text' }

  // 2. 文本通过 text-delta 流式输出
  yield { type: 'text-delta', index: 0, text: 'Hello' }
  yield { type: 'text-delta', index: 0, text: ' world' }

  // 3. 每个内容块以 block-end 结束（携带完整 block）
  yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Hello world' } }

  // 4. 工具调用块
  yield { type: 'block-start', index: 1, blockType: 'tool-call' }
  yield { type: 'tool-call-delta', index: 1, id: CallId('call-123'), name: 'bash', argumentsDelta: '{"command":"ls"}' }
  yield {
    type: 'block-end',
    index: 1,
    block: { type: 'tool-call', id: CallId('call-123'), name: 'bash', arguments: '{"command":"ls"}' },
  }

  // 5. Token 用量
  yield { type: 'usage', usage: { inputTokens: 100, outputTokens: 50 } }

  // 6. 结束原因（必须是最后一个分片）
  yield { type: 'finish', reason: { kind: 'stop' } }
  // 或 { kind: 'tool-calls' } 请求执行工具
}
```

**关键规则**：

- 每个 `block-start` 必须有对应的 `block-end`。
- `index` 从 0 递增，标识内容块顺序；同一块的每次 delta 复用该 index。
- `tool-call-delta` 的 `argumentsDelta` 是原始 JSON 文本增量，可一次或分多次生成。
- `finish` 必须是最后一个分片；`usage` 必须在 `finish` **之前**。
- 工具调用的 `arguments` 全程是原始 JSON 字符串（提供方返回解析对象时，在 `block-end` 重新 stringify）。

### 10.3 GenerateOptions 与 resolveModel

- `stream()` 接收 `GenerateOptions`：模型、推理强度 ID、对话历史、系统提示词、工具 schema、生成参数、停止序列、中止信号。完整字段以 `@deepseek-ai/dsh-llm` 的 TypeScript 类型为准。
- 无法支持的字段：抛带稳定 code 的 `LlmError`（如 `'UNSUPPORTED'`），**不得静默丢弃**。
- 覆写 `resolveModel(provider, model, signal?)` 返回确切的提供方/模型身份及可选的 `context` / `reasoning` 元数据；异步查询必须响应可选 signal。省略 `reasoning` 表示该模型没有可选推理强度能力。
- 适配器能向选择器公布模型选项时，覆写 `listModels()`。

### 10.4 注册与使用

```ts
ctx.llm.registerAdapter(['my-provider'], adapter)
```

- 第一个参数是该适配器处理的**提供方路由列表**；`options.provider` 选择适配器，`options.model` 是提供方模型 id（无需在生命周期启动时注册）。
- 每个提供方路由仅对应一个适配器，重复注册抛异常；多路由注册要么全部成功要么全部失败。
- 密钥用 Cordis 原生方式管理：schemastery Config + `!!js process.env.MY_KEY` 注入，**切勿在代码里读自行约定的密钥文件**。

```yaml
- id: my-llm
  name: './src/my-llm-adapter.ts'
  config:
    apiKey: !!js process.env.MY_API_KEY
    providers:
      - my-provider

- id: agent-loop
  name: '@deepseek-ai/dsh-agent-loop'
  config:
    agents:
      - id: main
        provider: my-provider
        model: my-model-v1
```

### 10.5 错误处理

- 传输与协议故障：从 `stream()` 抛出带稳定 code 的 `LlmError`（agent loop 保留该错误及 code 用于诊断与策略处理；不要依赖普通 `Error` 被自动转换）。
- 提供方带内故障：以 `finish {kind: 'error' | 'aborted'}` 结束流。
- 每个提供方 HTTP 请求合并 `attributionHeaders()` 并传递 `options.signal`。
- 需要回放状态的提供方（响应 ID、签名等）：以 `finish.replayState` 发出最小无损 JSON 投影；重建历史时验证该状态。

---

## 11. 扩展形态速查（钩子 / UI / 协议驱动）

官方手册：<https://deepseek-harness.github.io/deepseek-harness/reference/cookbook/extension-cookbook>

### 11.1 钩子插件（以权限门禁为例）

「原生钩子」就是在拦截点上运行的普通 Cordis 插件，不需要外部协议。`tools/pre-execute` 是 waterfall 事件，返回类型化决策：

```ts
import type { Context } from '@deepseek-ai/cordis'
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'

declare function isAllowed(exec: ToolExecution): Promise<boolean>

export const name = 'permission-gate'

export function apply(ctx: Context) {
  ctx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
    if (!(await isAllowed(exec))) {
      return { kind: 'deny', reason: 'Denied by policy.' }
    }
    return next()
  })
}
```

### 11.2 UI 插件

UI 插件从 `session/event` 事件流渲染（助手 token 以 `assistant/chunk` 到达，加上轮次/步骤边界与工具活动），并通过 `agent.followup()` / `agent.steer()` 把输入驱动回去：

```ts
import type { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'

declare function render(text: string): void
declare function onUserInput(handler: (text: string) => void): void

export const name = 'my-ui'
export const inject = ['agents']

export function apply(ctx: Context) {
  ctx.on('session/event', (_session, event) => {
    if (event.type === 'assistant/chunk' && event.data.chunk.type === 'text-delta') {
      render(event.data.chunk.text)
    }
  })
  onUserInput(text => ctx.agents.get(SessionId('client-session'))?.followup(createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  })))
}
```

向内置 Web Client 贡献业务行：注册 `ConversationNodeDefinition` + keyed Chat renderer（见《新增 Conversation Node》cookbook）。

### 11.3 外部协议驱动

协议驱动把协议对端接入 `ctx.agents`（stdio 驱动拥有 stdout，通过工厂创建/恢复 agent，把协议请求映射为 `followup()` / `cancel()`）。完整示例：`packages/acp/acp`（ACP JSON-RPC stdio，仅面向自动化）。teardown 通过 `AgentHandle.dispose()` 达到完全停稳。

---

## 12. 在仓库中新增一个包（checklist）

如果要在 dsh 仓库内新增 `@deepseek-ai/dsh-<name>` 包，按《实操手册：添加 workspace 包》执行：<https://deepseek-harness.github.io/deepseek-harness/reference/cookbook/adding-a-package>

**1. 创建包**（结构）：

```
packages/<group>/<pkg>/
  package.json     # 从 packages/core/tools 复制，调整 name/description/deps
  tsconfig.json    # extends ../../../tsconfig.base.json, rootDir src,
                   # outDir lib/types, references: vendor/cosmokit, vendor/cordis
                   # (+ vendor/schemastery 若用 Config, + 每个 dsh 依赖)
  src/index.ts     # service default export 或 plugin (name/inject/apply/Config)
  README.md        # 服务 API、事件、扩展点、设计说明 + Model Experience + Limitations
```

**2. package.json 不变式**（`pnpm run constraints` 强制执行）：`private: true`、`type: module`、`main: "lib/index.js"`、`types: "lib/types/index.d.ts"`、`exports["."].types/.default` 指向 lib、`@deepseek-ai/cordis` 同时出现在 peerDependencies 和 devDependencies、`@deepseek-ai/schemastery` 放 dependencies。

**3. 在根配置注册**：`tsconfig.host.json`（Host 包）或 `tsconfig.client.json`（Client 包）的 references 中加 `{ "path": "./packages/<group>/<pkg>" }`（普通包恰好属于一个 aggregate）。workspaces、publint、tsdown、lint、constraints 由 glob/manifest 发现机制自动覆盖。

**4. 命名角色**：接口包用能力名称；实现包加机制/协议/环境/厂商限定词；只有同主机执行是约定时才用 `local`。`Registry` 拥有动态注册与生命周期；`Runtime` 运行实时工作；`Provider` 提供能力实现；`Backend` 实现可替换的底层执行……（详见官方手册的角色词表）。

**5. 验证**：

```sh
pnpm install
pnpm run doc-sync
pnpm run constraints && pnpm run typecheck && pnpm run lint
pnpm run build && pnpm run hygiene
```

---

## 13. 功能 → 机制映射

新行为应附加到已有文档记录的扩展点。常用目标速查（详见架构文档）：

| 目标 | 机制 |
|---|---|
| 添加模型提供方 | 在 `ctx.llm` 上注册适配器 |
| 添加面向模型的能力 | 在 `ctx.tools` 上注册工具；schema 自动流入提示词组装 |
| 让会话拥有不同能力集合 | 组装 agent preset；服务行需要 `isolate` realm |
| 添加 shell 执行 | 注册 `ctx.shell` 后端；本地后端经 `ctx.subprocess` spawn |
| 添加持久化终端执行 | 注册 `ctx.terminals` 后端 + `dsh-tool-terminal` |
| 添加用户命令 | 注册 `ctx.commands`（无需模型轮次即可分派） |
| 添加后台工作 | 注册 `ctx.jobs`；`job_*` 工具负责收集/停止 |
| 添加文件系统访问或策略 | 注册 `ctx.fs` 提供方，或监听 `fs/*` 事件 |
| 限制所启动的进程 | 使用 `ctx.sandbox` 后端 |
| 拦截请求/工具/轮次 | 使用 `agent/*` 或 `tools/*` 事件；`agent/turn-stopping` 停止轮次 |
| 添加模型可见上下文 | `agent.inject()`（落到下一次获准的请求） |
| 添加 UI / 编辑器集成 | 驱动 `ctx.agents` 并从 `session/event` 渲染 |
| 添加 Web Client Chat 节点 | 注册 `ConversationNodeDefinition` + keyed renderer |
| 添加持久会话状态 | 扩展 `SessionEventMap`；从日志渲染与回放 |
| 生成会话标题 | 注册唯一的 `ctx.sessionTitle` 提供方 |
| 管理同会话目标 | 使用 `ctx.goals`；通过 `agent/*` 续跑 |
| fork 活跃会话 | `ctx.sessions.fork(source, boundary?, childSessionId?)` |
| 将注册限定到单个 agent | 使用该 agent 的 `agent.ctx` |

**事件域选择的第一个决定**：

- **会话事件**（`turn/*`、`step/*`、`user/message`、`assistant/*`、`tool/*`）是追加到日志、经 `session/event` 广播的持久事实——需要重载后仍存在的事实用它。
- **Agent 事件**（`agent/*`）携带活跃 `Agent`：inbox、步骤、状态、请求、验证、续跑——观察或拦截进行中的工作用它。
- **能力事件**（`fs/*`、`tools/*`、`telemetry/*`）无需导入循环即可附加策略和适配器。

**轮次（turn）结构速览**（有助于理解各扩展点在流程中的位置）：

```text
turn/start
  claim next-step input plus one queued message
  assemble prompt sections + tool schemas
  -> agent/pre-step                   reject | enter(messages)
     step/start
     append entered messages as user/message
     derive model history from the log
     agent/request -> llm/stream -> assistant/chunk* -> assistant/message
     tool/call* -> tools/pre-execute -> tools/execute -> tools/post-execute -> tool/result*
     step/end
  -> agent/turn-stopping
turn/end
```

---

## 14. 官方文档完整索引

### 开发（Develop）

| 页面 | 链接 |
|---|---|
| 第一个 Harness 插件 | https://deepseek-harness.github.io/deepseek-harness/develop/basic/ |
| 开发一个 Tool | https://deepseek-harness.github.io/deepseek-harness/develop/basic/tool |
| 插件配置 | https://deepseek-harness.github.io/deepseek-harness/develop/basic/config |
| 打包与安装插件 | https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish |
| 插件与生命周期 | https://deepseek-harness.github.io/deepseek-harness/develop/framework/ |
| 服务与依赖 | https://deepseek-harness.github.io/deepseek-harness/develop/framework/service |
| 事件系统 | https://deepseek-harness.github.io/deepseek-harness/develop/framework/events |
| 能力的三层拆分（实战） | https://deepseek-harness.github.io/deepseek-harness/develop/practice/ |
| LLM 适配器（实战） | https://deepseek-harness.github.io/deepseek-harness/develop/practice/llm-adapter |
| Cordis 框架教程（7 章） | https://deepseek-harness.github.io/deepseek-harness/develop/cordis-tutorial/ |

### 参考（Reference）

| 页面 | 链接 |
|---|---|
| 架构 | https://deepseek-harness.github.io/deepseek-harness/reference/ |
| Cordis 入门 | https://deepseek-harness.github.io/deepseek-harness/reference/cordis-primer |
| 能力 Seams 与核心服务 | https://deepseek-harness.github.io/deepseek-harness/reference/capability-seams |
| Agent 生命周期 | https://deepseek-harness.github.io/deepseek-harness/reference/agent-lifecycle |
| Tool 执行流水线 | https://deepseek-harness.github.io/deepseek-harness/reference/tool-execution-pipeline |
| 插件配置目录（生成） | https://deepseek-harness.github.io/deepseek-harness/reference/config-catalog |
| Tool Schema 目录（生成） | https://deepseek-harness.github.io/deepseek-harness/reference/tool-catalog |
| 持久化事件目录（生成） | https://deepseek-harness.github.io/deepseek-harness/reference/persistence-catalog |
| Cordis API（Context/Events/Fiber/Registry/Service/继承面） | https://deepseek-harness.github.io/deepseek-harness/reference/cordis-api/context |
| 新增 Package（cookbook） | https://deepseek-harness.github.io/deepseek-harness/reference/cookbook/adding-a-package |
| 新增 Tool（cookbook） | https://deepseek-harness.github.io/deepseek-harness/reference/cookbook/adding-a-tool |
| 新增 LLM Adapter（cookbook） | https://deepseek-harness.github.io/deepseek-harness/reference/cookbook/adding-an-llm-adapter |
| 扩展模式（cookbook） | https://deepseek-harness.github.io/deepseek-harness/reference/cookbook/extension-cookbook |
| 新增 Conversation Node（cookbook） | https://deepseek-harness.github.io/deepseek-harness/reference/cookbook/adding-a-conversation-node |
| 子系统总览 | https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/ |
| 入门：使用 Web UI | https://deepseek-harness.github.io/deepseek-harness/guide/quickstart |
| 入门：配置模型 | https://deepseek-harness.github.io/deepseek-harness/guide/providers |

---

## 附：新手最容易踩的五个坑

1. **patch 里插件路径必须是绝对路径**（本地开发时），且 `cordis.yml` 只贡献配置，不改 profile 目录。
2. **waterfall 监听器必须调用 `next()`**，否则整个流水线被短路；这是设计意图，但新手最容易漏。
3. **工具返回的是规范 JSON 值，不是内容块**；面向模型的人类可读文本放 `output.render`，UI 卡片放 `presentCall/presentResult`，三件事别混。
4. **不要在工具里内建部署策略**——用 `tools/pre-execute` 等事件扩展点；不要在代码里读自定密钥文件——用 Config + `!!js process.env.X`。
5. **配置是整行替换，不是深度合并**——覆盖别层配置时必须重述该行所有键；也正因如此，先给出用户大概率保留的默认值。
