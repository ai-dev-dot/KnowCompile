import { ipcMain, dialog } from 'electron'
import { initKnowledgeBase, getKBPath, setKBPath, checkSchemaUpdate, updateSchema } from './kb-init'
import { readLLMLogs, getLLMLogStats } from './llm-logger'
import { readQAAnalytics, getQAAnalyticsStats } from './qa-analytics'
import {
  listWikiPages,
  listRawFiles,
  readFile,
  writeFile,
  deleteFile,
  copyToRaw,
  extractBacklinks,
  extractLinks,
  getSchemaFiles,
} from './fs-manager'
import { chat, compileNewPages, testConnection } from './llm-service'
import type { ChatMessage } from './llm-service'
import { getSettings, getPublicSettings, saveSettings } from './settings-store'
import { buildIndex, search as searchIndex } from './search-indexer'
import { exportHTML, exportMarkdown, backup } from './exporter'
import { SAMPLE_FILES } from './samples'
import { validateCompileOutput, validateMultiPage } from './compile-validator'
import { IndexDB } from './index-db'
import { VectorDB } from './vector-db'
import { IndexRebuilder } from './index-rebuilder'
import { incrementalCompile } from './compile-service'
import { semanticQA, semanticQAStream } from './qa-service'
import {
  createConversation, addMessage, getConversation, listConversations,
  deleteConversation, getConversationHistory, updateFeedback,
} from './conversation-store'
import { listGaps, deleteGap } from './gap-store'
import pathModule from 'path'
import { resolveSafePath } from './path-utils'
import { loadSchemaPrompt } from './schema-loader'
import { Worker } from 'worker_threads'
import type { EmbeddingService } from './embedding-service'

export function registerIPCHandlers() {
  // Lazy service initialization — using Promise caches to prevent race
  // conditions when React StrictMode double-mounts and triggers concurrent
  // preload calls. Without promise caching, two ONNX models are loaded
  // simultaneously, blocking the event loop for 14+ seconds total.
  let indexDB: IndexDB | null = null
  let vectorDB: VectorDB | null = null
  let vectorDBPromise: Promise<VectorDB> | null = null
  let embeddingWorker: Worker | null = null
  let embeddingWorkerReady = false
  let embeddingDimension = 0
  let workerReqId = 0
  const workerPending = new Map<number, (result: any) => void>()

  // Thin proxy that forwards embedding calls to the worker thread.
  // Keeps the same surface as EmbeddingService so compile-service / qa-service
  // work unchanged.
  const embeddingProxy = {
    async initialize(onProgress?: (msg: { phase: string; detail: string }) => void): Promise<void> {
      if (embeddingWorkerReady) return
      const id = ++workerReqId
      return new Promise((resolve, reject) => {
        workerPending.set(id, (result: any) => {
          if (result.phase) { onProgress?.(result); return } // progress update
          if (result.ok) {
            embeddingDimension = result.dimension ?? 0
            embeddingWorkerReady = true
            resolve()
          } else {
            reject(new Error(result.error ?? 'embedding worker init failed'))
          }
        })
        embeddingWorker!.postMessage({ id, type: 'init' })
      })
    },

    async embedQuery(text: string): Promise<number[]> {
      const id = ++workerReqId
      return new Promise((resolve, reject) => {
        workerPending.set(id, (r: any) => r.ok ? resolve(r.vector) : reject(new Error(r.error)))
        embeddingWorker!.postMessage({ id, type: 'embed_query', text })
      })
    },

    async embedTexts(texts: string[]): Promise<number[][]> {
      const id = ++workerReqId
      return new Promise((resolve, reject) => {
        workerPending.set(id, (r: any) => r.ok ? resolve(r.vectors) : reject(new Error(r.error)))
        embeddingWorker!.postMessage({ id, type: 'embed_texts', texts })
      })
    },

    chunkText(text: string, chunkSize = 500): string[] {
      // Pure JS — runs in-process (no ONNX dependency)
      const paragraphs = text.split(/\n\s*\n/)
      if (paragraphs.length <= 1) {
        const trimmed = text.trim()
        if (trimmed.length <= chunkSize) return trimmed.length > 0 ? [trimmed] : []
        return splitBySentences(trimmed, chunkSize)
      }
      const chunks: string[] = []
      let current = ''
      for (const para of paragraphs) {
        const trimmed = para.trim()
        if (trimmed.length === 0) continue
        if (trimmed.length > chunkSize) {
          if (current.length > 0) { chunks.push(current); current = '' }
          chunks.push(...splitBySentences(trimmed, chunkSize))
          continue
        }
        if (current.length > 0 && current.length + 2 + trimmed.length > chunkSize) {
          chunks.push(current)
          current = trimmed
        } else {
          current = current.length > 0 ? current + '\n\n' + trimmed : trimmed
        }
      }
      if (current.length > 0) chunks.push(current)
      return chunks
    },

    getDimension(): number { return embeddingDimension },
    isReady(): boolean { return embeddingWorkerReady },

    dispose(): void {
      embeddingWorker?.terminate()
      embeddingWorker = null
      embeddingWorkerReady = false
    },
  }

  function splitBySentences(text: string, chunkSize: number): string[] {
    const sentences = text
      .split(/(?<=[。！？.!?])\s*/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    if (sentences.length <= 1) return [text.trim()]
    const chunks: string[] = []
    let current = ''
    for (const s of sentences) {
      if (s.length > chunkSize) {
        if (current.length > 0) { chunks.push(current); current = '' }
        for (let i = 0; i < s.length; i += chunkSize) chunks.push(s.slice(i, i + chunkSize).trim())
        continue
      }
      if (current.length > 0 && current.length + 1 + s.length > chunkSize) {
        chunks.push(current)
        current = s
      } else { current = current.length > 0 ? current + ' ' + s : s }
    }
    if (current.length > 0) chunks.push(current)
    return chunks
  }

  function getIndexDB(kbPath: string): IndexDB {
    if (!indexDB) indexDB = new IndexDB(kbPath)
    return indexDB
  }

  function getVectorDB(kbPath: string): Promise<VectorDB> {
    if (!vectorDBPromise) {
      vectorDBPromise = (async () => {
        const vdb = new VectorDB(kbPath)
        await vdb.initialize()
        vectorDB = vdb
        return vdb
      })()
    }
    return vectorDBPromise
  }

  function dirSizeKB(dirPath: string): number {
    const fs = require('fs')
    const path = require('path')
    if (!fs.existsSync(dirPath)) return 0
    let total = 0
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true })
      for (const entry of entries) {
        const full = path.join(dirPath, entry.name)
        if (entry.isDirectory()) {
          total += dirSizeKB(full)
        } else if (entry.isFile()) {
          total += fs.statSync(full).size
        }
      }
    } catch { /* permissions — return 0 */ }
    return Math.round(total / 1024)
  }

  // KB management
  ipcMain.handle('kb:init', (_event, basePath: string) => {
    return initKnowledgeBase(basePath)
  })

  ipcMain.handle('kb:get-path', () => {
    return getKBPath()
  })

  ipcMain.handle('kb:set-path', (_event, kbPath: string) => {
    setKBPath(kbPath)
    return { success: true }
  })

  ipcMain.handle('kb:select', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: '选择知识库目录',
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // Sequential preload of all heavy services with progress events.
  // Loading order: SQLite → VectorDB → EmbeddingModel (in worker) → warmup.
  ipcMain.handle('preload:embedding', async (event, kbPath: string) => {
    try {
      const send = (step: number, label: string, detail: string) => {
        event.sender.send('preload:progress', { step, label, detail, total: 4 })
      }

      // Step 1 — SQLite
      send(1, 'SQLite 数据库', '正在打开索引数据库...')
      getIndexDB(kbPath)

      // Step 2 — LanceDB vector store
      send(2, '向量数据库', '正在初始化向量索引...')
      await getVectorDB(kbPath)

      // Create the embedding worker (spawn it early so it loads in parallel)
      if (!embeddingWorker) {
        embeddingWorker = new Worker(
          pathModule.join(__dirname, 'embedding-worker.js'),
        )
        embeddingWorker.on('message', (msg: any) => {
          const resolve = workerPending.get(msg.id)
          if (resolve) {
            if (msg.phase) return resolve(msg) // progress update — keep pending
            workerPending.delete(msg.id)
            resolve(msg)
          }
        })
        embeddingWorker.on('error', (err) => {
          console.error('[embedding-worker] error:', err)
        })
      }

      // Step 3 — ONNX embedding model (loads in worker thread — no main-thread jank)
      const skipEmbedding = process.env.SKIP_EMBEDDING === '1'
      if (skipEmbedding) {
        send(3, '嵌入模型', '已跳过（SKIP_EMBEDDING=1）')
      } else {
        send(3, '嵌入模型', '正在加载模型到 Worker 线程...')
        await embeddingProxy.initialize((p) => {
          send(3, '嵌入模型', p.detail)
        })
      }

      // Step 4 — warmup (also runs in worker)
      if (skipEmbedding) {
        send(4, '嵌入模型预热', '已跳过（SKIP_EMBEDDING=1）')
      } else {
        send(4, '嵌入模型预热', 'Worker 线程首次推理编译...')
        await embeddingProxy.embedQuery('warmup')
      }

      // All done
      await new Promise<void>(resolve => {
        event.sender.send('preload:progress', { step: 4, label: '嵌入模型预热', detail: '加载完成', total: 4 })
        setImmediate(resolve)
      })

      return { success: true }
    } catch (err) { console.error('[preload] failed:', err); return { success: false } }
  })

  // File operations
  ipcMain.handle('wiki:list', (_event, kbPath: string) => {
    return listWikiPages(kbPath)
  })

  ipcMain.handle('wiki:read', (_event, kbPath: string, subpath: string) => {
    return readFile(resolveSafePath(kbPath, subpath))
  })

  ipcMain.handle('wiki:write', (_event, kbPath: string, subpath: string, content: string) => {
    // Normalize before persisting — safety net for any write path
    const { normalizeWikiPage } = require('./wiki-normalizer')
    writeFile(resolveSafePath(kbPath, subpath), normalizeWikiPage(content))
    return { success: true }
  })

  ipcMain.handle('wiki:delete', (_event, kbPath: string, subpath: string) => {
    deleteFile(resolveSafePath(kbPath, subpath))
    return { success: true }
  })

  ipcMain.handle('wiki:backlinks', (_event, kbPath: string, pageName: string) => {
    // Fast path — use SQLite links table (no disk scan)
    const db = getIndexDB(kbPath)
    const page = db.getPageByPath(`wiki/${pageName}.md`)
    if (page?.id) {
      const allLinks = db.getAllLinks()
      const backlinkIds = new Set<number>()
      for (const l of allLinks) {
        if (l.to_page_id === page.id) backlinkIds.add(l.from_page_id)
      }
      const result: string[] = []
      for (const id of backlinkIds) {
        const p = db.getPageById(id)
        if (p) result.push(p.title)
      }
      return result
    }
    // Fallback — page not yet indexed, scan filesystem
    return extractBacklinks(kbPath, pageName)
  })

  ipcMain.handle('wiki:extract-links', (_event, content: string) => {
    return extractLinks(content)
  })

  // Raw files
  ipcMain.handle('raw:list', (_event, kbPath: string) => {
    return listRawFiles(kbPath)
  })

  ipcMain.handle('raw:copy', (_event, kbPath: string, sourcePath: string) => {
    return copyToRaw(kbPath, sourcePath)
  })

  ipcMain.handle('raw:read', (_event, kbPath: string, subpath: string) => {
    return readFile(resolveSafePath(kbPath, subpath))
  })

  // Schema
  ipcMain.handle('schema:list', (_event, kbPath: string) => {
    return getSchemaFiles(kbPath)
  })

  ipcMain.handle('schema:write', (_event, kbPath: string, subpath: string, content: string) => {
    writeFile(resolveSafePath(kbPath, subpath), content)
    return { success: true }
  })

  // Schema version management
  ipcMain.handle('schema:check-update', (_event, kbPath: string) => {
    return checkSchemaUpdate(kbPath)
  })

  ipcMain.handle('schema:update', (_event, kbPath: string) => {
    return updateSchema(kbPath)
  })

  // Settings
  ipcMain.handle('settings:get', () => {
    return getPublicSettings()
  })

  ipcMain.handle('settings:save', (_event, settings) => {
    // If the API key looks masked (from getPublicSettings), preserve the real key
    if (settings.llm?.apiKey?.includes('...')) {
      const currentKey = getSettings().llm.apiKey
      if (currentKey && currentKey.length > 8) {
        settings.llm.apiKey = currentKey
      }
    }
    saveSettings(settings)
    return { success: true }
  })

  // LLM test connection
  ipcMain.handle('llm:test', async (_event, settings: { provider: string; apiKey: string; baseURL: string; model: string }) => {
    return testConnection(settings)
  })

  // Compile log tracking
  ipcMain.handle('compile:check', (_event, kbPath: string, rawFileName: string) => {
    const fs = require('fs')
    const path = require('path')

    // 1. Check compile-log.json first (fast path)
    const logPath = path.join(kbPath, '.ai-notes', 'compile-log.json')
    if (fs.existsSync(logPath)) {
      try {
        const log = JSON.parse(fs.readFileSync(logPath, 'utf-8'))
        const entry = log[rawFileName]
        if (entry) return { compiled: true, wikiPages: entry.pages, compiledAt: entry.at }
      } catch (err) { /* fall through to SQLite check */ }
    }

    // 2. Fall back to SQLite sources table
    const db = getIndexDB(kbPath)
    const source = db.getSourceByPath(`raw/${rawFileName}`)
    if (source && (source.status === 'compiled' || source.last_compiled_at)) {
      return { compiled: true, compiledAt: source.last_compiled_at || undefined }
    }
    return { compiled: false }
  })

  ipcMain.handle('compile:log', (_event, kbPath: string, rawFileName: string, wikiPages: string[]) => {
    const fs = require('fs')
    const path = require('path')
    const logPath = path.join(kbPath, '.ai-notes', 'compile-log.json')
    let log: Record<string, { pages: string[]; at: string }> = {}
    if (fs.existsSync(logPath)) {
      try { log = JSON.parse(fs.readFileSync(logPath, 'utf-8')) } catch (err) { console.error('Failed to parse compile-log.json:', err); log = {} }
    }
    log[rawFileName] = { pages: wikiPages, at: new Date().toISOString() }
    const dir = path.dirname(logPath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(logPath, JSON.stringify(log, null, 2), 'utf-8')
    return { success: true }
  })

  // Compile quality validation
  ipcMain.handle('compile:validate', (_event, content: string, pageName: string) => {
    return validateCompileOutput(content, pageName)
  })

  ipcMain.handle('compile:validate-all', (_event, output: string) => {
    return validateMultiPage(output)
  })

  // Self-improving compile: iterate until quality threshold met
  ipcMain.handle('compile:iterate', async (_event, kbPath: string, rawFilePath: string) => {
    const fs = require('fs')
    const path = require('path')
    const rawContent = fs.readFileSync(rawFilePath, 'utf-8')
    const rawName = path.basename(rawFilePath)

    const wikiDir = path.join(kbPath, 'wiki')
    const existingTitles: string[] = fs.existsSync(wikiDir)
      ? fs.readdirSync(wikiDir).filter((f: string) => f.endsWith('.md')).map((f: string) => f.replace('.md', ''))
      : []

    const maxIterations = 3
    const targetScore = 80
    const results: { iteration: number; score: number; output: string }[] = []

    let lastOutput = ''

    for (let i = 0; i < maxIterations; i++) {
      let compileResult: string
      if (i === 0) {
        compileResult = await compileNewPages(rawContent, rawName, existingTitles, kbPath)
      } else {
        // Fix iteration: feed validation issues back to LLM
        const issues = validateMultiPage(lastOutput)
        const errorList = issues.reports
          .flatMap(r => r.issues)
          .map(iss => `[${iss.severity}] ${iss.rule}: ${iss.message}`)
          .join('\n')

        const schema = loadSchemaPrompt(kbPath)

        compileResult = await chat([
          { role: 'system', content: schema },
          { role: 'user', content: `你上一轮编译的输出有以下质量问题，请逐一修复后重新输出完整的 Wiki 页面：\n\n${errorList}\n\n上一轮输出：\n${lastOutput}` },
        ])
      }

      lastOutput = compileResult
      const validation = validateMultiPage(compileResult)
      results.push({ iteration: i + 1, score: validation.overallScore, output: compileResult })

      if (validation.overallScore >= targetScore) break
    }

    return {
      rawFileName: rawName,
      iterations: results.length,
      finalScore: results[results.length - 1].score,
      compileOutput: results[results.length - 1].output,
      history: results.map(r => ({ iteration: r.iteration, score: r.score })),
    }
  })

  // LLM compile
  ipcMain.handle('llm:compile', async (_event, kbPath: string, rawFilePath: string) => {
    const fs = require('fs')
    const path = require('path')
    const ext = path.extname(rawFilePath).toLowerCase()
    const rawName = path.basename(rawFilePath)

    let rawContent: string
    if (ext === '.pdf') {
      const pdfBuffer = fs.readFileSync(rawFilePath)
      const pdfData = await require('pdf-parse')(pdfBuffer)
      rawContent = pdfData.text
    } else {
      rawContent = fs.readFileSync(rawFilePath, 'utf-8')
    }

    const wikiDir = path.join(kbPath, 'wiki')
    const existingTitles: string[] = fs.existsSync(wikiDir)
      ? fs.readdirSync(wikiDir)
          .filter((f: string) => f.endsWith('.md'))
          .map((f: string) => f.replace('.md', ''))
      : []

    return compileNewPages(rawContent, rawName, existingTitles, kbPath)
  })

  // Graph data
  ipcMain.handle('graph:data', async (_event, kbPath: string) => {
    const fs = require('fs')
    const path = require('path')
    const yield_ = () => new Promise<void>(r => setImmediate(r))
    const wikiDir = path.join(kbPath, 'wiki')
    if (!fs.existsSync(wikiDir)) return { nodes: [], edges: [] }

    const nodes: { id: string; label: string; linkCount: number }[] = []
    const edges: { source: string; target: string }[] = []
    const linkCount: Record<string, number> = {}

    const files = fs.readdirSync(wikiDir).filter((f: string) => f.endsWith('.md'))
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const name = file.replace('.md', '')
      const content = fs.readFileSync(path.join(wikiDir, file), 'utf-8')
      for (const target of extractLinks(content)) {
        edges.push({ source: name, target })
        linkCount[name] = (linkCount[name] || 0) + 1
        linkCount[target] = (linkCount[target] || 0) + 1
      }
      if (i % 5 === 0) await yield_()
    }

    for (const file of files) {
      const name = file.replace('.md', '')
      nodes.push({ id: name, label: name, linkCount: linkCount[name] || 0 })
    }

    // Filter edges to only include those where both source and target are actual nodes
    const nodeIds = new Set(nodes.map(n => n.id))
    const validEdges = edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))

    return { nodes, edges: validEdges }
  })

  // Search
  ipcMain.handle('search:build', async (_event, kbPath: string) => {
    const fs = require('fs')
    const path = require('path')
    const yield_ = () => new Promise<void>(r => setImmediate(r))
    const wikiDir = path.join(kbPath, 'wiki')
    if (!fs.existsSync(wikiDir)) return { success: false }

    const pageFiles = fs.readdirSync(wikiDir).filter((f: string) => f.endsWith('.md'))
    const pages: { name: string; content: string }[] = []
    for (let i = 0; i < pageFiles.length; i++) {
      const f = pageFiles[i]
      pages.push({
        name: f.replace('.md', ''),
        content: fs.readFileSync(path.join(wikiDir, f), 'utf-8'),
      })
      if (i % 5 === 0) await yield_()
    }

    buildIndex(kbPath, pages)
    return { success: true, count: pages.length }
  })

  ipcMain.handle('search:query', (_event, kbPath: string, query: string) => {
    return searchIndex(kbPath, query)
  })

  // Export
  ipcMain.handle('export:html', (_event, kbPath: string) => exportHTML(kbPath))
  ipcMain.handle('export:markdown', (_event, kbPath: string) => exportMarkdown(kbPath))
  ipcMain.handle('export:backup', async (_event, kbPath: string) => backup(kbPath))

  // Samples
  ipcMain.handle('samples:load', (_event, kbPath: string) => {
    const fs = require('fs')
    const path = require('path')
    const crypto = require('crypto')
    const rawDir = path.join(kbPath, 'raw')
    if (!fs.existsSync(rawDir)) fs.mkdirSync(rawDir, { recursive: true })

    const db = getIndexDB(kbPath)

    for (const sample of SAMPLE_FILES) {
      const destPath = path.join(rawDir, sample.name)
      if (!fs.existsSync(destPath)) {
        fs.writeFileSync(destPath, sample.content, 'utf-8')
      }
      // Register in SQLite if not already tracked
      const sourcePath = `raw/${sample.name}`
      if (!db.getSourceByPath(sourcePath)) {
        const stat = fs.statSync(destPath)
        const hash = crypto.createHash('sha256').update(sample.content).digest('hex')
        db.addSource({
          path: sourcePath,
          filename: sample.name,
          size: stat.size,
          hash,
          status: 'pending',
        })
      }
    }

    // Initialize tracking manifest (don't overwrite if it already exists)
    const manifestPath = path.join(kbPath, '.ai-notes', 'sample-pages.json')
    if (!fs.existsSync(manifestPath)) {
      fs.writeFileSync(manifestPath, '[]', 'utf-8')
    }

    return { success: true, count: SAMPLE_FILES.length }
  })

  ipcMain.handle('samples:track-page', (_event, kbPath: string, pageName: string) => {
    const fs = require('fs')
    const path = require('path')
    const manifestPath = path.join(kbPath, '.ai-notes', 'sample-pages.json')
    let pages: string[] = []
    if (fs.existsSync(manifestPath)) {
      try { pages = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) } catch (err) { console.error('Failed to parse sample manifest:', err); pages = [] }
    }
    if (!pages.includes(pageName)) {
      pages.push(pageName)
      fs.writeFileSync(manifestPath, JSON.stringify(pages, null, 2), 'utf-8')
    }
    return { success: true }
  })

  ipcMain.handle('samples:delete', (_event, kbPath: string) => {
    const fs = require('fs')
    const path = require('path')
    const rawDir = path.join(kbPath, 'raw')
    const wikiDir = path.join(kbPath, 'wiki')
    const manifestPath = path.join(kbPath, '.ai-notes', 'sample-pages.json')

    // Delete sample files from raw/
    if (fs.existsSync(rawDir)) {
      for (const sample of SAMPLE_FILES) {
        const filePath = path.join(rawDir, sample.name)
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      }
    }

    // Delete tracked wiki pages
    let pages: string[] = []
    if (fs.existsSync(manifestPath)) {
      try { pages = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) } catch (err) { console.error('Failed to parse sample manifest:', err); pages = [] }
    }

    // Fallback: if manifest is empty (e.g. pages were compiled before
    // trackSamplePage existed), find sample-generated pages via compile-log.
    if (pages.length === 0) {
      const logPath2 = path.join(kbPath, '.ai-notes', 'compile-log.json')
      if (fs.existsSync(logPath2)) {
        try {
          const log = JSON.parse(fs.readFileSync(logPath2, 'utf-8'))
          for (const sample of SAMPLE_FILES) {
            const entry = log[sample.name]
            if (entry?.pages) pages.push(...entry.pages)
          }
        } catch { /* ignore */ }
      }
    }

    if (fs.existsSync(wikiDir)) {
      for (const pageName of pages) {
        const pagePath = path.join(wikiDir, `${pageName}.md`)
        if (fs.existsSync(pagePath)) fs.unlinkSync(pagePath)
      }
    }

    // Remove manifest
    if (fs.existsSync(manifestPath)) fs.unlinkSync(manifestPath)

    // Clean up compile-log.json entries for sample files
    const logPath = path.join(kbPath, '.ai-notes', 'compile-log.json')
    if (fs.existsSync(logPath)) {
      try {
        const log = JSON.parse(fs.readFileSync(logPath, 'utf-8'))
        for (const sample of SAMPLE_FILES) {
          delete log[sample.name]
        }
        for (const pageName of pages) {
          for (const key of Object.keys(log)) {
            if (log[key].pages?.includes(pageName)) {
              delete log[key]
            }
          }
        }
        fs.writeFileSync(logPath, JSON.stringify(log, null, 2), 'utf-8')
      } catch (err) { console.error('Failed to clean compile-log.json:', err) }
    }

    // Clean up SQLite entries (sources and pages)
    const db = getIndexDB(kbPath)
    for (const sample of SAMPLE_FILES) {
      const sourcePath = `raw/${sample.name}`
      const source = db.getSourceByPath(sourcePath)
      if (source?.id) {
        // Delete page records for pages generated from this source
        if (pages.length > 0) {
          for (const pageName of pages) {
            const page = db.getPageByPath(`wiki/${pageName}.md`)
            if (page?.id) db.deletePage(`wiki/${pageName}.md`)
          }
        }
        // Delete source record
        db.deleteSource(sourcePath)
      }
    }

    return { success: true, deletedPages: pages }
  })

  ipcMain.handle('samples:check', (_event, kbPath: string) => {
    const fs = require('fs')
    const path = require('path')
    const rawDir = path.join(kbPath, 'raw')
    const hasSamples = fs.existsSync(rawDir) &&
      SAMPLE_FILES.some(s => fs.existsSync(path.join(rawDir, s.name)))
    return { loaded: hasSamples }
  })

  // Index management
  ipcMain.handle('index:rebuild', async (event, kbPath: string) => {
    const rebuilder = new IndexRebuilder(kbPath)
    return rebuilder.rebuild((progress) => {
      event.sender.send('rebuild:progress', progress)
    })
  })

  ipcMain.handle('index:status', (_event, kbPath: string) => {
    const db = getIndexDB(kbPath)
    const pages = db.listPages().length
    const sources = db.listSources().length
    const lastRebuild = db.getSetting('last_rebuild', '从未')
    return { pages, sources, lastRebuild }
  })

  // Diagnostics — aggregate system info from all storage layers
  ipcMain.handle('diagnostics:system-info', async (_event, kbPath: string) => {
    const db = getIndexDB(kbPath)
    // NOTE: only check already-initialized services — do NOT force lazy init here.
    // Embedding model loading is CPU-heavy (20-60s) and would block the main process.
    const vdb = vectorDB // may be null
    const embedding = embeddingWorkerReady ? embeddingProxy : null
    const path = require('path')
    const fs = require('fs')

    // -- SQLite --
    const indexDir = path.join(kbPath, '.index')
    const pagesDbPath = path.join(indexDir, 'pages.db')
    const pagesDbSizeKB = fs.existsSync(pagesDbPath) ? Math.round(fs.statSync(pagesDbPath).size / 1024) : 0

    const sources = db.listSources()
    const sourceByStatus = { pending: 0, compiling: 0, compiled: 0, failed: 0 }
    for (const s of sources) {
      const st = s.status || 'pending'
      if (st in sourceByStatus) (sourceByStatus as any)[st]++
    }

    // Count raw/wiki files on disk for comparison
    const rawDir = path.join(kbPath, 'raw')
    const rawDiskCount = fs.existsSync(rawDir)
      ? fs.readdirSync(rawDir).filter((f: string) => !f.startsWith('.')).length
      : 0
    const wikiDir = path.join(kbPath, 'wiki')
    const wikiDiskCount = fs.existsSync(wikiDir)
      ? fs.readdirSync(wikiDir).filter((f: string) => f.endsWith('.md')).length
      : 0

    const sqlite = {
      filePath: pagesDbPath,
      fileSizeKB: pagesDbSizeKB,
      wikiDiskCount,
      pageCount: db.listPages().length,
      sourceCount: sources.length,
      rawDiskCount,
      sourceByStatus,
      linkCount: db.getAllLinks().length,
      conflictCount: db.listOpenConflicts().length,
      settingsCount: Object.keys(db.getAllSettings()).length,
    }

    // -- LanceDB --
    const lancedbDir = path.join(indexDir, 'vectors.lancedb')
    const lancedbSizeKB = dirSizeKB(lancedbDir)
    const chunkStats = vdb ? await vdb.stats() : { totalChunks: 0, pageChunks: 0, sourceChunks: 0 }

    const lancedb = {
      dirPath: lancedbDir,
      totalChunks: chunkStats.totalChunks,
      pageChunks: chunkStats.pageChunks,
      sourceChunks: chunkStats.sourceChunks,
      dirSizeKB: lancedbSizeKB,
    }

    // -- Embedding --
    const emb = {
      model: 'bge-m3',
      dimension: embedding ? embedding.getDimension() : 0,
      ready: embedding ? embedding.isReady() : false,
    }

    // -- Storage / meta --
    const aiNotesDir = path.join(kbPath, '.ai-notes')
    const compileLogPath = path.join(aiNotesDir, 'compile-log.json')
    let compileLogEntries = 0
    if (fs.existsSync(compileLogPath)) {
      try { compileLogEntries = Object.keys(JSON.parse(fs.readFileSync(compileLogPath, 'utf-8'))).length } catch {}
    }

    const storage = {
      indexDirSizeKB: dirSizeKB(indexDir),
      compileLogEntries,
      lastRebuild: db.getSetting('last_rebuild', '从未'),
      flexSearchBuilt: false, // in-memory only, no way to query without adding state
    }

    return { sqlite, lancedb, embedding: emb, storage }
  })

  // Semantic compile & QA (v2)
  ipcMain.handle('llm:compile-v2', async (event, kbPath: string, rawFilePath: string) => {
    const db = getIndexDB(kbPath)
    const vdb = await getVectorDB(kbPath)
    const embedding = embeddingProxy
    return incrementalCompile(rawFilePath, kbPath, embedding as any as EmbeddingService, db, vdb, undefined, (progress) => {
      event.sender.send('compile:progress', progress)
    })
  })

  ipcMain.handle('llm:qa-v2', async (_event, kbPath: string, question: string) => {
    const db = getIndexDB(kbPath)
    const vdb = await getVectorDB(kbPath)
    const embedding = embeddingProxy
    return semanticQA(question, kbPath, embedding as any as EmbeddingService, db, vdb)
  })

  // Advanced settings
  ipcMain.handle('settings:get-advanced', (_event, kbPath: string) => {
    const db = getIndexDB(kbPath)
    const defaults: Record<string, string> = {
      chunk_size: '500',
      compile_similarity_threshold: '0.75',
      compile_candidate_count: '3',
      qa_similarity_threshold: '0.65',
      qa_retrieval_count: '30',
      qa_final_context_count: '8',
      qa_context_max_tokens: '3000',
      qa_hybrid_search: '1',
      qa_review_enabled: '0',
    }
    const saved = db.getAllSettings()
    return { ...defaults, ...saved }
  })

  ipcMain.handle('settings:save-advanced', (_event, kbPath: string, settings: Record<string, string>) => {
    const db = getIndexDB(kbPath)
    for (const [key, value] of Object.entries(settings)) {
      db.setSetting(key, String(value))
    }
    return { success: true }
  })

  // Conflict management
  ipcMain.handle('conflicts:list', (_event, kbPath: string) => {
    const db = getIndexDB(kbPath)
    return db.listOpenConflicts()
  })

  ipcMain.handle('conflicts:resolve', (_event, kbPath: string, conflictId: number, resolution: string) => {
    const db = getIndexDB(kbPath)
    db.resolveConflict(conflictId, resolution)
    return { success: true }
  })

  // QA archiving
  ipcMain.handle('wiki:archive-qa', (_event, kbPath: string, question: string, answer: string) => {
    const fs = require('fs')
    const path = require('path')
    const synthesisDir = path.join(kbPath, 'wiki', 'synthesis')
    if (!fs.existsSync(synthesisDir)) {
      fs.mkdirSync(synthesisDir, { recursive: true })
    }
    const dateStr = new Date().toISOString().slice(0, 10)
    const safeName = question.slice(0, 30).replace(/[\\/:*?"<>|]/g, '_')
    const fileName = `问答-${dateStr}-${safeName}.md`
    const filePath = path.join(synthesisDir, fileName)
    const content = `---
title: ${question}
type: qa
date: ${dateStr}
---

# ${question}

> 来源：AI 问答归档

## 问题

${question}

## 回答

${answer}
`
    fs.writeFileSync(filePath, content, 'utf-8')
    return { success: true, path: `wiki/synthesis/${fileName}` }
  })

  // LLM interaction logs
  ipcMain.handle('llm-logs:list', (_event, kbPath: string, query?: { since?: string; role?: string; limit?: number }) => {
    return readLLMLogs(kbPath, { ...query, role: query?.role as any })
  })

  ipcMain.handle('llm-logs:stats', (_event, kbPath: string) => {
    return getLLMLogStats(kbPath)
  })

  // QA analytics
  ipcMain.handle('qa-analytics:list', (_event, kbPath: string, query?: { since?: string; limit?: number }) => {
    return readQAAnalytics(kbPath, query)
  })

  ipcMain.handle('qa-analytics:stats', (_event, kbPath: string) => {
    return getQAAnalyticsStats(kbPath)
  })

  // -----------------------------------------------------------------------
  // QA Streaming (Phase 1) — with correlation ID to prevent interleaving
  // -----------------------------------------------------------------------

  ipcMain.handle('qa:ask-stream', async (event, requestId: string, kbPath: string, question: string, convId?: string, historyLimit?: number) => {
    const db = getIndexDB(kbPath)
    const vdb = await getVectorDB(kbPath)
    const embedding = embeddingProxy

    // Load conversation history if convId provided
    let history: ChatMessage[] | undefined
    if (convId) {
      const msgs = getConversationHistory(kbPath, convId, historyLimit || 10)
      history = msgs.map(m => ({ role: m.role, content: m.content }))
    }

    // Create conversation if not provided
    let activeConvId = convId
    if (!activeConvId) {
      activeConvId = createConversation(kbPath).id
    }

    // Save user message
    addMessage(kbPath, activeConvId, { role: 'user', content: question })

    // Build system prompt context
    let accumulated = ''

    try {
      const stream = semanticQAStream(
        question, kbPath,
        embedding as any as EmbeddingService,
        db, vdb,
        undefined, history,
      )
      for await (const ev of stream) {
        if (event.sender.isDestroyed()) break
        if (ev.type === 'token') {
          accumulated = ev.accumulated || ''
          event.sender.send('qa:token', {
            requestId,
            token: ev.token,
            accumulated,
            thinking: ev.thinking,
          })
        } else if (ev.type === 'done') {
          // Save assistant message (use cleaned answer if suggestions were parsed)
          const finalContent = ev.accumulated || accumulated
          addMessage(kbPath, activeConvId, {
            role: 'assistant',
            content: finalContent,
            sources: ev.sources,
          })
          event.sender.send('qa:token-end', {
            requestId,
            sources: ev.sources,
            accumulated: finalContent,
            suggestions: ev.suggestions,
            suggestArchive: ev.suggestArchive,
            thinking: ev.thinking,
            convId: activeConvId,
          })
        } else if (ev.type === 'error') {
          // Save partial answer
          if (accumulated) {
            addMessage(kbPath, activeConvId, {
              role: 'assistant',
              content: accumulated + '\n\n[已停止生成]',
            })
          }
          event.sender.send('qa:token-end', {
            requestId,
            error: ev.error,
            accumulated,
            partial: true,
            suggestArchive: false,
            convId: activeConvId,
          })
        }
      }
    } catch (err: any) {
      if (!event.sender.isDestroyed()) {
        event.sender.send('qa:token-end', {
          requestId,
          error: err?.message || 'Stream failed',
          accumulated,
          partial: true,
          convId: activeConvId,
        })
      }
    }
  })

  // -----------------------------------------------------------------------
  // Feedback (Phase 1)
  // -----------------------------------------------------------------------

  ipcMain.handle('qa:feedback', (_event, kbPath: string, convId: string, msgIndex: number, type: 'helpful' | 'inaccurate' | 'more_detail') => {
    const updated = updateFeedback(kbPath, convId, msgIndex, type)
    // Also try to update the most recent QA LLM log entry
    try {
      const recentLogs = readLLMLogs(kbPath, { role: 'qa', limit: 1 })
      if (recentLogs.length > 0) {
        const entry = recentLogs[0]
        entry.feedback = type
        entry.feedbackAt = new Date().toISOString()
        const { logLLMInteraction } = require('./llm-logger')
        logLLMInteraction(kbPath, entry)
      }
    } catch { /* non-critical */ }
    return { success: !!updated }
  })

  // -----------------------------------------------------------------------
  // Conversation management (Phase 1)
  // -----------------------------------------------------------------------

  ipcMain.handle('conv:list', (_event, kbPath: string) => {
    return listConversations(kbPath)
  })

  ipcMain.handle('conv:create', (_event, kbPath: string, title?: string) => {
    return createConversation(kbPath, title)
  })

  ipcMain.handle('conv:get', (_event, kbPath: string, convId: string) => {
    return getConversation(kbPath, convId)
  })

  ipcMain.handle('conv:delete', (_event, kbPath: string, convId: string) => {
    return { success: deleteConversation(kbPath, convId) }
  })

  // -----------------------------------------------------------------------
  // Knowledge gaps (v0.2.0)
  // -----------------------------------------------------------------------

  ipcMain.handle('gaps:list', (_event, kbPath: string) => {
    return listGaps(kbPath)
  })

  ipcMain.handle('gaps:delete', (_event, kbPath: string, gapId: string) => {
    return { success: deleteGap(kbPath, gapId) }
  })
}
