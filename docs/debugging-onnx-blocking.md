# 一次Electron主进程卡死62秒的排查之旅

## 症状：一个诡异的卡顿bug

我们的 Electron 桌面应用 "KnowCompile"（本地 wiki 知识库）有一个奇怪的卡顿 bug：

**进入应用后，流畅操作一会，然后突然卡死，什么都点不了，持续十几秒甚至一分钟，然后又自己好了。**

最诡异的是：知识库里只有不到 10 个 wiki 页面（每篇几百字），我没做什么重操作，只是在不同页面之间切换——Wiki、问答、图谱、设置。

"数据量这么小，能卡什么？"

接下来是我花了半天时间排查这个 bug 的完整过程。

## 第一轮：错误的 I/O 假设

因为最近加过搜索索引构建功能，我第一个怀疑的是文件 I/O。翻代码发现几个问题：

**问题1：所有 7 个视图同时挂载。** App.tsx 用 CSS `hidden`/`flex` 切换视图，不是条件渲染。这意味着进入应用时，WikiView、GraphView、IngestView、QAView、SettingsView、SystemView、LogViewer **全部挂载**，它们的 `useEffect` 全部触发。

**问题2：多个视图无差别触发重量级操作。** WikiView 挂载即触发了 `search:build`（读所有 wiki 文件 + 构建 FlexSearch 索引），GraphView 挂载即触发了 `graph:data`（读所有 wiki 文件 + 提取链接），而且这两个操作都没有检查视图是否激活。

**问题3：反向链接扫描。** 每次点击一个 wiki 页面，`extractBacklinks` 会**再次扫描全部 wiki 文件**来找反向链接。

于是第一轮修复：
- WikiView 和 GraphView 加 `active` 守卫（只在用户主动切过去时才加载）
- 反向链接改用 SQLite 的 links 表查询（毫秒级）
- 重量级 handler 加 `setImmediate` yield 点

代码写得挺好，但用户一测——**还是卡。**

## 第二轮：数据不会骗人

"不到 10 个 wiki 页面，读文件再慢能慢到哪去？"

我需要**数据**而不是猜测。于是在主进程加了一个事件循环监控：

```typescript
// 每100ms检查一次，如果回调被延迟超过130ms，说明事件循环被阻塞了
let lastCheck = process.hrtime.bigint()
setInterval(() => {
  const now = process.hrtime.bigint()
  const elapsed = Number(now - lastCheck) / 1e6
  lastCheck = now
  if (elapsed > 130) {
    console.warn(`[main-lag] event loop blocked for ${elapsed.toFixed(0)} ms`)
  }
}, 100)
```

同时在渲染进程用 `requestAnimationFrame` 监控 FPS。

结果令人震惊：

```
[main-lag] event loop blocked for 3995 ms   ← 4秒
[main-lag] event loop blocked for 2648 ms   ← 2.6秒
[main-lag] event loop blocked for 62736 ms  ← 62秒！！！！
```

主进程事件循环被阻塞了**62秒**。这不是文件读写能解释的。

更重要的是，这些阻塞发生的时间点：4秒和2.6秒在 preload 阶段（用户看到的是启动画面），但 62 秒的阻塞**发生在进入应用之后**。

## 第三轮：React StrictMode 火上浇油

进一步看日志，发现 preload 的每一步被调用了**两次**：

```
[preload] step1 SQLite: 13 ms
[preload] step1 SQLite: 0 ms       ← 重复
[preload] step3 EmbeddingModel: 7128 ms
[preload] step3 EmbeddingModel: 7286 ms  ← 两个 ONNX 模型被同时加载！
```

React StrictMode 在开发模式下会双次调用 `useEffect` 来检测副作用问题。preload 逻辑在 `useEffect` 中，导致**两个 ONNX 模型被同时初始化**，每个加载 ~7 秒，总计 ~14 秒的主线程阻塞。

修复：lazy init 加 Promise 缓存，防止并发初始化：

```typescript
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
```

好了，双重加载解决了，从 14 秒降到 3.8 秒。但——**还是卡。**

## 第四轮：锁定真凶

StrictMode 修复后仍然有 22~44 秒的阻塞：

```
[main-lag] event loop blocked for 44406 ms  ← 44秒
```

这些阻塞不在 preload 阶段，也不在任何 IPC handler 内部（我加了全局 IPC 计时包装，没有任何 handler 被记录为慢）。

**阻塞不在 JS 层，在原生层。**

怀疑列表：
1. ONNX Runtime 线程池抢占 CPU → 限制 `ORT_INTRA_OP_NUM_THREADS=1` → **无效**
2. HuggingFace 网络超时 → 设置 `env.allowRemoteModels = false` → **无效**
3. Windows Defender 扫描模型文件？→ 不好验证

最关键的实验：**跳过 ONNX 加载**。

```bash
SKIP_EMBEDDING=1 npm run dev:all
```

结果：**零阻塞。60 秒监控，一个 >500ms 的事件循环延迟都没有。**

真凶确认：ONNX Runtime（`onnxruntime-node` v1.24.3）+ bge-m3 模型。

具体是 ONNX Runtime 的什么操作在主线程上阻塞了数十秒？可能是 Windows Defender 扫描 ~568MB 的模型权重文件、可能是 ONNX 内部的内存管理或图优化、可能是 Windows 线程调度器在线程池竞争下的行为——但在**不需要推理的时候**，一个已经加载完毕的 ONNX 模型本不该有任何影响。

这是个环境相关的问题：相同代码在 Mac 上可能不会触发（没有 Windows Defender，pthread 调度策略不同），但在 Windows 10 + Node.js v24 + onnxruntime-node v1.24.3 的组合下，主进程事件循环会被 ONNX Runtime 的内部操作周期性窒息。

## 正确的修复：Worker 线程隔离

线程限制、禁用网络、调优参数——这些都是在症状层面修修补补。**根本问题是 ONNX Runtime 和 Electron 主进程在同一个线程上。** 正确的解法是把它们分开。

Node.js 有 `worker_threads` 模块，可以把 CPU 密集型任务放到独立线程。我把 EmbeddingService 拆成了两部分：

**embedding-worker.ts**（在 Worker 线程中运行）：
```typescript
// 独立的 worker 线程，随你怎么阻塞
const extractor = await pipeline('feature-extraction', 'Xenova/bge-m3', { dtype: 'int8' })
// ... 处理 embedQuery / embedTexts 请求
parentPort?.postMessage({ id, vector: [...] })
```

**ipc-handlers.ts**（在主进程中，通过 proxy 通信）：
```typescript
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
```

核心思路：**主进程不再 `import` 任何 ONNX 相关模块。** 所有 embedding 调用都是异步消息，worker 线程内部的阻塞不影响主进程事件循环。

## 效果

修复前：
```
主进程最大阻塞：62,736 ms  ← 完全不可用
```

修复后：
```
主进程最大阻塞：162 ms      ← 正常范围
```

ONNX 加载在 worker 线程中耗时 ~6.7 秒（和之前一样），但主进程在此期间继续处理 UI 事件——启动画面正常更新进度条，进入应用后一切流畅。

## 经验总结

1. **先诊断，再修复。** 如果没有加事件循环监控，我可能还在修文件 I/O。一行 `setInterval` + `process.hrtime()` 省了几个小时的猜测。

2. **排除法很有效。** `SKIP_EMBEDDING=1` 实验直接锁定了根因范围。当你不确定问题在哪时，二分法排除是最快的方式。

3. **看懂阻塞在哪个层级。** JS 层的阻塞（同步文件读写）和原生层的阻塞（ONNX Runtime 内部操作）表现相似但解法完全不同。IPC 计时包装帮我确认了没有 JS handler 是慢的，从而把目光转向原生层。

4. **环境差异是真实的。** 同一个 onnxruntime-node 版本，Mac/Linux 用户可能完全遇不到这个问题。Windows Defender 的文件扫描、Windows 线程调度策略、不同平台的 ONNX Runtime 构建——这些「环境问题」就是你的用户会遇到的真实 bug。

5. **根治 > 修补。** 调线程数、禁用网络访问、加 yield 点——这些都是有价值的优化，但真正解决问题的是架构层面的改变：把阻塞源移到独立线程。两小时调参不如半小时重构。

6. **React StrictMode 的双重调用在生产环境不会有，但它暴露了 lazy init 的竞态条件。** 这是一个好的提醒：开发模式的严格检查能帮你发现边界情况，即使生产环境不会触发。
