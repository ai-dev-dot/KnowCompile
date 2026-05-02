// Sample data for KnowCompile — gstack and superpowers introductions

export interface SampleFile {
  name: string
  content: string
}

const cb = '```'

export const SAMPLE_FILES: SampleFile[] = [
  {
    name: 'sample-超好用的skill之gstack.md',
    content: `# gstack 系统介绍

## 什么是 gstack

gstack 是 Y Combinator CEO Garry Tan 开源的 AI 工程工作流系统——将 Claude Code 变成虚拟工程团队。23 个专业角色（CEO 评审、工程经理、设计师、QA、安全审计、发布工程师），全部通过斜杠命令调用，MIT 开源许可。

核心理念：**Think → Plan → Build → Review → Test → Ship → Reflect**，每个技能的输出自动流入下一个技能。

## 核心工作流

### 构思阶段

| 命令 | 角色 | 作用 |
|------|------|------|
| \`/office-hours\` | YC Office Hours | 6 个强制问题，在写代码前重新定义产品方向 |
| \`/plan-ceo-review\` | CEO 评审 | 四种模式：扩展/选择性扩展/保持范围/缩减 |
| \`/plan-eng-review\` | 工程经理 | 锁定架构、数据流、边界条件、测试策略 |
| \`/plan-design-review\` | 高级设计师 | 每个设计维度 0-10 评分，AI 审美检测 |
| \`/autoplan\` | 评审流水线 | 一键完成 CEO → 设计 → 工程评审全流程 |

### 评审与测试

| 命令 | 角色 | 作用 |
|------|------|------|
| \`/review\` | 高级工程师 | 找到 CI 通过但生产环境会炸的 bug |
| \`/investigate\` | 调试专家 | 系统化根因调试，不调查完不许修 |
| \`/qa\` | QA 负责人 | 打开真实浏览器测试、修 bug、原子化提交、回归验证 |
| \`/qa-only\` | QA 报告员 | 只报告不改代码 |
| \`/cso\` | 首席安全官 | OWASP Top 10 + STRIDE 威胁模型 |

### 浏览器能力

| 命令 | 作用 |
|------|------|
| \`/browse\` | 真实 Chromium 浏览器，~100ms/指令，约 70 个原子化命令 |
| \`/setup-browser-cookies\` | 从 Chrome 导入 Cookie，测试需要登录的页面 |
| \`/pair-agent\` | 多 AI Agent 协同——不同 AI 各自在同一个浏览器中独立工作 |

### 发布与运维

| 命令 | 作用 |
|------|------|
| \`/ship\` | 同步 main、跑测试、覆盖率审计、push、开 PR |
| \`/document-release\` | 自动更新所有项目文档匹配最新代码 |

### 安全工具

| 命令 | 作用 |
|------|------|
| \`/careful\` | 危险命令前警告（rm -rf、DROP TABLE、force-push） |
| \`/freeze\` | 锁定编辑范围到一个目录，防止意外修改 |
| \`/guard\` | 同时启用 careful + freeze |

## 安装（30 秒）

\`\`\`bash
git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack && cd ~/.claude/skills/gstack && ./setup
\`\`\`

## 核心设计理念

1. **技能串联**：每个技能的输出是下一个技能的输入。\`/office-hours\` → \`/plan-ceo-review\` → \`/plan-eng-review\` → \`/qa\`
2. **多 Agent 并行**：结合 Conductor 可同时跑 10-15 个并行 Sprint，每个在独立工作空间中
3. **持续检查点**：自动 WIP 提交，崩溃后可恢复上下文，\`/ship\` 时 squash WIP 提交
4. **提示注入防御**：Sidebar Agent 内置多层防御（ML 分类器 + Haiku 验证 + Canary Token）

## 适用场景

- **技术型创始人/CEO**：保持出码能力的同时管理公司
- **首次使用 AI 编程**：结构化角色代替空白 prompt
- **技术负责人**：每次 PR 的严格评审、QA、发布自动化
- **10 种 AI Agent 兼容**：Claude Code、Codex CLI、Cursor、OpenCode、Hermes 等

## Garry Tan 的实际数据

2026 年 YTD：逻辑代码变更效率是 2013 年的 **240 倍**（排除 AI 膨胀后的标准化计算），40+ 已发布功能，3 个生产服务。Garry 全职运营 Y Combinator，编程全部通过 AI Agent 完成。

## 相关主题

- [[Superpowers 插件]]
- [[AI Agent开发入门]]
- [[LLM应用性能优化]]
`,
  },
  {
    name: 'sample-superpowers插件介绍.md',
    content: `# Superpowers 插件介绍

## 什么是 Superpowers

Superpowers 是 Jesse Vincent（Prime Radiant）为 AI 编程 Agent 构建的完整软件开发方法论。它不是零散的命令集合，而是一套**自动触发**的强制工作流系统——Agent 在执行任何任务前都会检查相关技能是否适用。

核心理念：**在写代码之前先思考**。Agent 不会一上来就写代码，而是先引导你理清需求、设计架构、制定计划，然后按计划自动执行。

## 核心工作流（7 步）

| 步骤 | 技能 | 触发时机 | 作用 |
|------|------|----------|------|
| 1 | \`brainstorming\` | 任何创意工作之前 | 苏格拉底式提问，在写代码前理清产品方向 |
| 2 | \`using-git-worktrees\` | 设计评审通过后 | 创建隔离工作空间，保护主分支 |
| 3 | \`writing-plans\` | 设计确定后 | 将工作拆分为 2-5 分钟的小任务，每任务含精确路径和验证步骤 |
| 4 | \`subagent-driven-development\` | 计划完成后 | 按任务逐个 dispatch 子 Agent，两级评审（需求合规 → 代码质量） |
| 5 | \`test-driven-development\` | 实现代码期间 | RED-GREEN-REFACTOR：先写失败测试 → 看它失败 → 写最小代码 → 看它通过 |
| 6 | \`requesting-code-review\` | 任务完成后 | 对照计划评审，严重问题阻止继续 |
| 7 | \`finishing-a-development-branch\` | 全部任务完成 | 合并/PR/保留/丢弃选项，清理工作空间 |

## 技能分类

### 测试

| 技能 | 作用 |
|------|------|
| \`test-driven-development\` | RED-GREEN-REFACTOR 循环，含测试反模式参考 |
| \`systematic-debugging\` | 4 阶段根因调试（含根因追踪、纵深防御、条件等待） |
| \`verification-before-completion\` | 在声明"修好了"之前运行验证命令 |

### 协作

| 技能 | 作用 |
|------|------|
| \`brainstorming\` | 苏格拉底式设计优化 |
| \`writing-plans\` | 详细实现计划 |
| \`dispatching-parallel-agents\` | 并行分派 2+ 个子 Agent 处理独立任务 |
| \`executing-plans\` | 批量执行，每个检查点需要人工确认 |
| \`requesting-code-review\` | 对照计划评审 |
| \`receiving-code-review\` | 处理评审反馈，要求技术验证而非表面同意 |

## 核心哲学

1. **测试驱动开发**：永远先写测试。敢于删除先写实现的代码
2. **系统化而非临时方案**：流程优先于猜测
3. **简单性优先**：复杂度缩减是首要目标
4. **证据优于断言**：先验证再宣告成功

## 安装方式

### Claude Code

\`\`\`bash
/plugin install superpowers@claude-plugins-official
\`\`\`

### 其他平台

- **Codex CLI**: \`/plugins\` → 搜索 \`superpowers\`
- **Cursor**: \`/add-plugin superpowers\`
- **Gemini CLI**: \`gemini extensions install https://github.com/obra/superpowers\`

## 与 gstack 的对比

| 维度 | Superpowers | gstack |
|------|-------------|--------|
| 定位 | 开发方法论 + 技能系统 | 虚拟工程团队 + 斜杠命令 |
| 触发方式 | 自动检测触发 | 用户手动调用 |
| 核心流程 | Think → Plan → TDD → Review | Think → Plan → Build → Review → Test → Ship → Reflect |
| 作者 | Jesse Vincent (Prime Radiant) | Garry Tan (Y Combinator CEO) |
| 强项 | 方法论的严谨性和系统性（强制 TDD、隔离工作空间） | 多角色覆盖和浏览器测试能力 |

两者可以互补使用——Superpowers 提供开发流程纪律，gstack 提供专业角色和浏览器测试。

## 相关主题

- [[超好用的skill之gstack]]
- [[AI Agent开发入门]] — AI Agent 编程的底层能力
`,
  },
  {
    name: 'sample-一次Electron主进程卡死62秒的排查之旅.md',
    content: `# 一次Electron主进程卡死62秒的排查之旅

## 症状：一个诡异的卡顿bug

我们的 Electron 桌面应用 "KnowCompile"（本地 wiki 知识库）有一个奇怪的卡顿 bug：

**进入应用后，流畅操作一会，然后突然卡死，什么都点不了，持续十几秒甚至一分钟，然后又自己好了。**

最诡异的是：知识库里只有不到 10 个 wiki 页面（每篇几百字），我没做什么重操作，只是在不同页面之间切换——Wiki、问答、图谱、设置。

"数据量这么小，能卡什么？"

接下来是我花了半天时间排查这个 bug 的完整过程。

## 第一轮：错误的 I/O 假设

因为最近加过搜索索引构建功能，我第一个怀疑的是文件 I/O。翻代码发现几个问题：

**问题1：所有 7 个视图同时挂载。** App.tsx 用 CSS hidden/flex 切换视图，不是条件渲染。这意味着进入应用时，WikiView、GraphView、IngestView、QAView、SettingsView、SystemView、LogViewer **全部挂载**，它们的 useEffect 全部触发。

**问题2：多个视图无差别触发重量级操作。** WikiView 挂载即触发了 search:build（读所有 wiki 文件 + 构建 FlexSearch 索引），GraphView 挂载即触发了 graph:data（读所有 wiki 文件 + 提取链接），而且这两个操作都没有检查视图是否激活。

**问题3：反向链接扫描。** 每次点击一个 wiki 页面，extractBacklinks 会**再次扫描全部 wiki 文件**来找反向链接。

于是第一轮修复：
- WikiView 和 GraphView 加 active 守卫（只在用户主动切过去时才加载）
- 反向链接改用 SQLite 的 links 表查询（毫秒级）
- 重量级 handler 加 setImmediate yield 点

代码写得挺好，但用户一测——**还是卡。**

## 第二轮：数据不会骗人

"不到 10 个 wiki 页面，读文件再慢能慢到哪去？"

我需要**数据**而不是猜测。于是在主进程加了一个事件循环监控：

` + cb + `typescript
// 每100ms检查一次，如果回调被延迟超过130ms，说明事件循环被阻塞了
let lastCheck = process.hrtime.bigint()
setInterval(() => {
  const now = process.hrtime.bigint()
  const elapsed = Number(now - lastCheck) / 1e6
  lastCheck = now
  if (elapsed > 130) {
    console.warn(\`[main-lag] event loop blocked for \${elapsed.toFixed(0)} ms\`)
  }
}, 100)
` + cb + `

同时在渲染进程用 requestAnimationFrame 监控 FPS。

结果令人震惊：

` + cb + `
[main-lag] event loop blocked for 3995 ms   ← 4秒
[main-lag] event loop blocked for 2648 ms   ← 2.6秒
[main-lag] event loop blocked for 62736 ms  ← 62秒！！！！
` + cb + `

主进程事件循环被阻塞了**62秒**。这不是文件读写能解释的。

更重要的是，这些阻塞发生的时间点：4秒和2.6秒在 preload 阶段（用户看到的是启动画面），但 62 秒的阻塞**发生在进入应用之后**。

## 第三轮：React StrictMode 火上浇油

进一步看日志，发现 preload 的每一步被调用了**两次**：

` + cb + `
[preload] step1 SQLite: 13 ms
[preload] step1 SQLite: 0 ms       ← 重复
[preload] step3 EmbeddingModel: 7128 ms
[preload] step3 EmbeddingModel: 7286 ms  ← 两个 ONNX 模型被同时加载！
` + cb + `

React StrictMode 在开发模式下会双次调用 useEffect 来检测副作用问题。preload 逻辑在 useEffect 中，导致**两个 ONNX 模型被同时初始化**，每个加载 ~7 秒，总计 ~14 秒的主线程阻塞。

修复：lazy init 加 Promise 缓存，防止并发初始化：

` + cb + `typescript
let embeddingPromise: Promise<EmbeddingService> | null = null

function getEmbeddingService(): Promise<EmbeddingService> {
  if (!embeddingPromise) {
    embeddingPromise = (async () => {
      const svc = new EmbeddingService()
      await svc.initialize()
      return svc
    })()
  }
  return embeddingPromise  // 第二个调用者等同一个 Promise
}
` + cb + `

好了，双重加载解决了，从 14 秒降到 3.8 秒。但——**还是卡。**

## 第四轮：锁定真凶

StrictMode 修复后仍然有 22~44 秒的阻塞：

` + cb + `
[main-lag] event loop blocked for 44406 ms  ← 44秒
` + cb + `

这些阻塞不在 preload 阶段，也不在任何 IPC handler 内部（我加了全局 IPC 计时包装，没有任何 handler 被记录为慢）。

**阻塞不在 JS 层，在原生层。**

怀疑列表：
1. ONNX Runtime 线程池抢占 CPU → 限制 ORT_INTRA_OP_NUM_THREADS=1 → **无效**
2. HuggingFace 网络超时 → 设置 env.allowRemoteModels = false → **无效**
3. Windows Defender 扫描模型文件？→ 不好验证

最关键的实验：**跳过 ONNX 加载**。

` + cb + `bash
SKIP_EMBEDDING=1 npm run dev:all
` + cb + `

结果：**零阻塞。60 秒监控，一个 >500ms 的事件循环延迟都没有。**

真凶确认：ONNX Runtime（onnxruntime-node v1.24.3）+ bge-m3 模型。

具体是 ONNX Runtime 的什么操作在主线程上阻塞了数十秒？可能是 Windows Defender 扫描 ~568MB 的模型权重文件、可能是 ONNX 内部的内存管理或图优化、可能是 Windows 线程调度器在线程池竞争下的行为——但在**不需要推理的时候**，一个已经加载完毕的 ONNX 模型本不该有任何影响。

这是个环境相关的问题：相同代码在 Mac 上可能不会触发（没有 Windows Defender，pthread 调度策略不同），但在 Windows 10 + Node.js v24 + onnxruntime-node v1.24.3 的组合下，主进程事件循环会被 ONNX Runtime 的内部操作周期性窒息。

## 正确的修复：Worker 线程隔离

线程限制、禁用网络、调优参数——这些都是在症状层面修修补补。**根本问题是 ONNX Runtime 和 Electron 主进程在同一个线程上。** 正确的解法是把它们分开。

Node.js 有 worker_threads 模块，可以把 CPU 密集型任务放到独立线程。我把 EmbeddingService 拆成了两部分：

**embedding-worker.ts**（在 Worker 线程中运行）：
` + cb + `typescript
// 独立的 worker 线程，随你怎么阻塞
const extractor = await pipeline('feature-extraction', 'Xenova/bge-m3', { dtype: 'int8' })
// ... 处理 embedQuery / embedTexts 请求
parentPort?.postMessage({ id, vector: [...] })
` + cb + `

**ipc-handlers.ts**（在主进程中，通过 proxy 通信）：
` + cb + `typescript
const embeddingProxy = {
  async embedQuery(text: string): Promise<number[]> {
    const id = ++workerReqId
    return new Promise((resolve) => {
      workerPending.set(id, resolve)
      embeddingWorker!.postMessage({ id, type: 'embed_query', text })
    })
  },
  // embedTexts、chunkText 同理
}
` + cb + `

核心思路：**主进程不再 import 任何 ONNX 相关模块。** 所有 embedding 调用都是异步消息，worker 线程内部的阻塞不影响主进程事件循环。

## 效果

修复前：
` + cb + `
主进程最大阻塞：62,736 ms  ← 完全不可用
` + cb + `

修复后：
` + cb + `
主进程最大阻塞：162 ms      ← 正常范围
` + cb + `

ONNX 加载在 worker 线程中耗时 ~6.7 秒（和之前一样），但主进程在此期间继续处理 UI 事件——启动画面正常更新进度条，进入应用后一切流畅。

## 经验总结

1. **先诊断，再修复。** 如果没有加事件循环监控，我可能还在修文件 I/O。一行 setInterval + process.hrtime() 省了几个小时的猜测。

2. **排除法很有效。** SKIP_EMBEDDING=1 实验直接锁定了根因范围。当你不确定问题在哪时，二分法排除是最快的方式。

3. **看懂阻塞在哪个层级。** JS 层的阻塞（同步文件读写）和原生层的阻塞（ONNX Runtime 内部操作）表现相似但解法完全不同。IPC 计时包装帮我确认了没有 JS handler 是慢的，从而把目光转向原生层。

4. **环境差异是真实的。** 同一个 onnxruntime-node 版本，Mac/Linux 用户可能完全遇不到这个问题。Windows Defender 的文件扫描、Windows 线程调度策略、不同平台的 ONNX Runtime 构建——这些「环境问题」就是你的用户会遇到的真实 bug。

5. **根治 > 修补。** 调线程数、禁用网络访问、加 yield 点——这些都是有价值的优化，但真正解决问题的是架构层面的改变：把阻塞源移到独立线程。两小时调参不如半小时重构。

6. **React StrictMode 的双重调用在生产环境不会有，但它暴露了 lazy init 的竞态条件。** 这是一个好的提醒：开发模式的严格检查能帮你发现边界情况，即使生产环境不会触发。

## 相关主题

- [[AI Agent开发入门]] — AI Agent 编程的底层能力
- [[LLM应用性能优化]]
`,
  },
  {
    name: 'sample-在 Windows 下使用 bge-m3 嵌入模型的注意事项.md',
    content: `# 在 Windows 下使用 bge-m3 嵌入模型的注意事项

## 背景

如果你的 Electron / Node.js 应用需要在本地做文本嵌入（把一段文本转成向量，用于语义搜索或 RAG），大概率会选用 bge-m3 模型。在 Node.js 生态里，加载 bge-m3 最常用的方式是 @huggingface/transformers：

${cb}typescript
import { pipeline } from '@huggingface/transformers'

const extractor = await pipeline('feature-extraction', 'Xenova/bge-m3', {
  dtype: 'int8',  // 量化版本，约 568 MB
})
${cb}

这段代码在 macOS / Linux 上通常工作正常。但在 **Windows** 下运行时，可能会遇到一个诡异的问题。

## 症状

应用在加载 bge-m3 之后，会出现**周期性卡死**：

- 进入应用后流畅使用一会，然后突然无响应
- 每次卡死持续十几秒到一分钟
- 卡死后自行恢复，过一会又卡
- **和数据量无关**——即使知识库里只有几篇文档、模型也没在做推理，照样卡

用事件循环监控抓到的数据：

${cb}
[main-lag] event loop blocked for 44406 ms  ← 44 秒
[main-lag] event loop blocked for 62736 ms  ← 62 秒
${cb}

主进程事件循环被阻塞了一分钟。期间整个应用完全无法操作。

## 原因

bge-m3 模型本身是一个 ONNX 格式的文件。@huggingface/transformers 在 Node.js 环境下使用 onnxruntime-node（微软的 ONNX Runtime 推理引擎）来加载和执行这个模型。

onnxruntime-node 是 C++ 写的原生模块。它在初始化时会：

1. **创建内部线程池**——默认使用所有 CPU 核心
2. **加载模型权重到内存**——bge-m3 int8 量化版本约 568 MB

即使模型加载完毕、不做任何推理，以下因素也可能在 Windows 上导致主线程阻塞：

- **Windows Defender 实时扫描**：568 MB 的模型文件被 Defender 盯上，I/O 被抢占
- **线程调度竞争**：ONNX 线程池 + Node.js 线程池 + Chromium 线程同时争抢 CPU
- **ONNX 内部维护**：内存整理、图优化等操作可能与主线程竞争同一把锁

核心矛盾是：**onnxruntime-node 的原生代码和 Electron 主进程跑在同一个线程上**。原生层一旦被卡住（不管是被 Defender 还是线程调度），整个应用就无响应。

这个问题在 macOS / Linux 上较少出现，因为：
- 没有 Windows Defender
- pthread 线程调度行为和 Windows 不同
- 文件系统 I/O 模型不同

## 如何确认是不是 bge-m3 的问题

**方法一：事件循环监控**

在主进程加一段代码，放在所有 import 之前：

${cb}javascript
let lastCheck = process.hrtime.bigint()
setInterval(() => {
  const now = process.hrtime.bigint()
  const elapsed = Number(now - lastCheck) / 1e6
  lastCheck = now
  if (elapsed > 500) {
    console.warn(\`[main-lag] blocked for \${elapsed.toFixed(0)} ms\`)
  }
}, 100).unref()
${cb}

如果日志里频繁出现几百毫秒以上的阻塞，说明主进程被卡了。

**方法二：排除法**

${cb}bash
# 临时跳过 bge-m3 加载
SKIP_EMBEDDING=1 npm run dev
${cb}

如果跳过模型后应用完全不卡了，那就确认是 bge-m3 / ONNX Runtime 的问题。

## 解决方案

### 方案一：Worker 线程隔离（推荐）

把 bge-m3 的加载和推理全部放到 worker_threads 中，和主进程物理隔离。Worker 线程随便卡，主进程不受影响。

**embedding-worker.ts**：

${cb}typescript
import { parentPort } from 'worker_threads'
import { pipeline, env } from '@huggingface/transformers'

env.allowRemoteModels = false
env.allowLocalModels = true

let extractor = null

parentPort?.on('message', async (msg) => {
  if (msg.type === 'init') {
    extractor = await pipeline('feature-extraction', 'Xenova/bge-m3', {
      dtype: 'int8',
    })
    parentPort?.postMessage({ id: msg.id, ok: true })
  }
  if (msg.type === 'embed') {
    const output = await extractor(msg.text, {
      pooling: 'mean', normalize: true,
    })
    parentPort?.postMessage({ id: msg.id, vector: output.tolist()[0] })
  }
})
${cb}

**主进程**：

${cb}typescript
import { Worker } from 'worker_threads'

const worker = new Worker('./embedding-worker.js')
let reqId = 0
const pending = new Map()

worker.on('message', (msg) => {
  const resolve = pending.get(msg.id)
  pending.delete(msg.id)
  resolve(msg)
})

function embedQuery(text: string): Promise<number[]> {
  return new Promise((resolve) => {
    const id = ++reqId
    pending.set(id, resolve)
    worker.postMessage({ id, type: 'embed', text })
  })
}
${cb}

关键：**主进程不 import @huggingface/transformers**。任何 ONNX 相关的模块只在 Worker 线程中加载。

实测效果：

${cb}
修复前：主进程最大阻塞 62,736 ms  ← 完全不可用
修复后：主进程最大阻塞    162 ms  ← 正常范围
${cb}

bge-m3 在 Worker 线程中加载耗时 ~6.7 秒（和之前一样），但主进程在此期间正常处理 UI 事件，用户感知不到。

### 方案二：限制线程数

在加载模型之前设置环境变量。**必须放在所有 import 之前**：

${cb}typescript
// electron/env-setup.ts，作为 main.ts 的第一个 import
process.env.ORT_INTRA_OP_NUM_THREADS = '1'
process.env.ORT_INTER_OP_NUM_THREADS = '1'
${cb}

注意：此方案**能缓解但不能根除**。实测限制到 1 线程后，仍有 44 秒阻塞出现。

### 方案三：延迟加载

不在应用启动时加载 bge-m3，改为首次使用 AI 功能时才加载。适合用户主要用 Wiki 浏览、偶尔用问答的场景。

## 不只是 bge-m3

这个问题不限于 bge-m3。只要在 Windows + Node.js / Electron 环境下使用 ONNX Runtime——无论是 all-MiniLM、multilingual-e5 还是你自己训练的 ONNX 模型——都有同样的风险。图像分类、语音识别等场景也一样。

## 要点

1. **Worker 线程是最可靠的方案**，不受平台和环境变量影响
2. 启动时加载 bge-m3 没问题，只要加载在 Worker 线程中进行
3. setInterval + process.hrtime() 是诊断主进程卡顿的利器，建议长期保留
4. Windows 环境尤其要小心——杀毒软件扫描大模型文件、线程调度行为都和 Mac/Linux 不同
5. 设置 env.allowRemoteModels = false 可以避免 @huggingface/transformers 尝试访问 HuggingFace Hub 导致的额外网络延迟

## 相关主题

- [[一次Electron主进程卡死62秒的排查之旅]] — 完整的排查过程
- [[LLM应用性能优化]]
`,
  },
]
