# 在 Windows 下使用 bge-m3 嵌入模型的注意事项

## 背景

如果你的 Electron / Node.js 应用需要在本地做文本嵌入（把一段文本转成向量，用于语义搜索或 RAG），大概率会选用 bge-m3 模型。在 Node.js 生态里，加载 bge-m3 最常用的方式是 `@huggingface/transformers`：

```typescript
import { pipeline } from '@huggingface/transformers'

const extractor = await pipeline('feature-extraction', 'Xenova/bge-m3', {
  dtype: 'int8',  // 量化版本，约 568 MB
})
```

这段代码在 macOS / Linux 上通常工作正常。但在 **Windows** 下运行时，可能会遇到一个诡异的问题。

## 症状

应用在加载 bge-m3 之后，会出现**周期性卡死**：

- 进入应用后流畅使用一会，然后突然无响应
- 每次卡死持续十几秒到一分钟
- 卡死后自行恢复，过一会又卡
- **和数据量无关**——即使知识库里只有几篇文档、模型也没在做推理，照样卡

用事件循环监控抓到的数据：

```
[main-lag] event loop blocked for 44406 ms  ← 44 秒
[main-lag] event loop blocked for 62736 ms  ← 62 秒
```

主进程事件循环被阻塞了一分钟。期间整个应用完全无法操作。

## 原因

bge-m3 模型本身是一个 ONNX 格式的文件。`@huggingface/transformers` 在 Node.js 环境下使用 `onnxruntime-node`（微软的 ONNX Runtime 推理引擎）来加载和执行这个模型。

`onnxruntime-node` 是 C++ 写的原生模块。它在初始化时会：

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

```javascript
let lastCheck = process.hrtime.bigint()
setInterval(() => {
  const now = process.hrtime.bigint()
  const elapsed = Number(now - lastCheck) / 1e6
  lastCheck = now
  if (elapsed > 500) {
    console.warn(`[main-lag] blocked for ${elapsed.toFixed(0)} ms`)
  }
}, 100).unref()
```

如果日志里频繁出现几百毫秒以上的阻塞，说明主进程被卡了。

**方法二：排除法**

```bash
# 临时跳过 bge-m3 加载
SKIP_EMBEDDING=1 npm run dev
```

如果跳过模型后应用完全不卡了，那就确认是 bge-m3 / ONNX Runtime 的问题。

## 解决方案

### 方案一：Worker 线程隔离（推荐）

把 bge-m3 的加载和推理全部放到 `worker_threads` 中，和主进程物理隔离。Worker 线程随便卡，主进程不受影响。

**embedding-worker.ts**：

```typescript
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
```

**主进程**：

```typescript
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
```

关键：**主进程不 import `@huggingface/transformers`**。任何 ONNX 相关的模块只在 Worker 线程中加载。

实测效果：

```
修复前：主进程最大阻塞 62,736 ms  ← 完全不可用
修复后：主进程最大阻塞    162 ms  ← 正常范围
```

bge-m3 在 Worker 线程中加载耗时 ~6.7 秒（和之前一样），但主进程在此期间正常处理 UI 事件，用户感知不到。

### 方案二：限制线程数

在加载模型之前设置环境变量。**必须放在所有 import 之前**：

```typescript
// electron/env-setup.ts，作为 main.ts 的第一个 import
process.env.ORT_INTRA_OP_NUM_THREADS = '1'
process.env.ORT_INTER_OP_NUM_THREADS = '1'
```

注意：此方案**能缓解但不能根除**。实测限制到 1 线程后，仍有 44 秒阻塞出现。

### 方案三：延迟加载

不在应用启动时加载 bge-m3，改为首次使用 AI 功能时才加载。适合用户主要用 Wiki 浏览、偶尔用问答的场景。

## 不只是 bge-m3

这个问题不限于 bge-m3。只要在 Windows + Node.js / Electron 环境下使用 ONNX Runtime——无论是 all-MiniLM、multilingual-e5 还是你自己训练的 ONNX 模型——都有同样的风险。图像分类、语音识别等场景也一样。

## 要点

1. **Worker 线程是最可靠的方案**，不受平台和环境变量影响
2. 启动时加载 bge-m3 没问题，只要加载在 Worker 线程中进行
3. `setInterval` + `process.hrtime()` 是诊断主进程卡顿的利器，建议长期保留
4. Windows 环境尤其要小心——杀毒软件扫描大模型文件、线程调度行为都和 Mac/Linux 不同
5. 设置 `env.allowRemoteModels = false` 可以避免 `@huggingface/transformers` 尝试访问 HuggingFace Hub 导致的额外网络延迟
