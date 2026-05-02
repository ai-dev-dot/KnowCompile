/**
 * Embedding worker — runs ONNX bge-m3 in a separate Node.js worker_thread
 * so the native ONNX Runtime thread-pool / internal operations never block
 * the Electron main-process event loop.
 *
 * Communicates with the main process via postMessage; each request has a
 * monotonically-increasing `id` so responses can be correlated.
 */

import { parentPort } from 'worker_threads'
import { pipeline, env } from '@huggingface/transformers'
import type { FeatureExtractionPipeline } from '@huggingface/transformers'

env.allowRemoteModels = false
env.allowLocalModels = true

if (process.env.EMBEDDING_REMOTE_HOST) {
  env.remoteHost = process.env.EMBEDDING_REMOTE_HOST
}

// Limit threads within the worker too — it has its own event loop, but we
// still don't want it to starve the whole machine.
process.env.ORT_INTRA_OP_NUM_THREADS = process.env.ORT_INTRA_OP_NUM_THREADS || '1'
process.env.ORT_INTER_OP_NUM_THREADS = process.env.ORT_INTER_OP_NUM_THREADS || '1'

let extractor: FeatureExtractionPipeline | null = null
let dimension = 0

interface Request {
  id: number
  type: 'init' | 'embed_query' | 'embed_texts' | 'stats'
  text?: string
  texts?: string[]
}

function reply(id: number, payload: Record<string, unknown>) {
  parentPort?.postMessage({ id, ...payload })
}

parentPort?.on('message', async (msg: Request) => {
  try {
    switch (msg.type) {
      case 'init': {
        const dtype = (process.env.EMBEDDING_DTYPE || 'int8') as
          | 'fp32' | 'fp16' | 'int8' | 'uint8' | 'q4' | 'q4f16' | 'bnb4'

        reply(msg.id, { phase: 'downloading', detail: '正在加载嵌入模型...' })

        extractor = await pipeline('feature-extraction', 'Xenova/bge-m3', {
          dtype,
          progress_callback: (info: any) => {
            const label = info.file ?? ''
            if (info.status === 'downloading' && label) {
              const pct = info.progress != null ? ` ${Math.round(info.progress)}%` : ''
              reply(msg.id, { phase: 'downloading', detail: `下载 ${label}${pct}` })
            }
          },
        })

        reply(msg.id, { phase: 'warming', detail: '首次推理编译...' })

        const output = await extractor('dimension probe', {
          pooling: 'mean',
          normalize: true,
        })
        const arr = output.tolist()
        dimension = Array.isArray(arr[0]) ? (arr[0] as number[]).length : 0

        reply(msg.id, { ok: true, dimension })
        break
      }

      case 'embed_query': {
        if (!extractor) { reply(msg.id, { ok: false, error: 'not initialized' }); break }
        const output = await extractor(msg.text!, { pooling: 'mean', normalize: true })
        const arr = output.tolist()
        reply(msg.id, { ok: true, vector: (arr[0] as number[]) ?? [] })
        break
      }

      case 'embed_texts': {
        if (!extractor) { reply(msg.id, { ok: false, error: 'not initialized' }); break }
        const output = await extractor(msg.texts!, { pooling: 'mean', normalize: true })
        const arr = output.tolist()
        reply(msg.id, { ok: true, vectors: arr.map((v) => v as number[]) })
        break
      }

      case 'stats': {
        reply(msg.id, { ok: true, dimension, ready: extractor !== null })
        break
      }
    }
  } catch (err: any) {
    reply(msg.id, { ok: false, error: err?.message ?? String(err) })
  }
})
