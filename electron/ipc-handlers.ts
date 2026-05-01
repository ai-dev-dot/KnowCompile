import { ipcMain, dialog } from 'electron'
import { initKnowledgeBase, getKBPath, setKBPath, checkSchemaUpdate, updateSchema } from './kb-init'
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
import { getSettings, getPublicSettings, saveSettings } from './settings-store'
import { buildIndex, search as searchIndex } from './search-indexer'
import { exportHTML, exportMarkdown, backup } from './exporter'
import { SAMPLE_FILES } from './samples'
import { validateCompileOutput, validateMultiPage } from './compile-validator'
import { IndexDB } from './index-db'
import { VectorDB } from './vector-db'
import { EmbeddingService } from './embedding-service'
import { IndexRebuilder } from './index-rebuilder'
import { incrementalCompile } from './compile-service'
import { semanticQA } from './qa-service'
import pathModule from 'path'
import { resolveSafePath } from './path-utils'
import { loadSchemaPrompt } from './schema-loader'

export function registerIPCHandlers() {
  // Lazy service initialization
  let indexDB: IndexDB | null = null
  let vectorDB: VectorDB | null = null
  let embeddingService: EmbeddingService | null = null

  function getIndexDB(kbPath: string): IndexDB {
    if (!indexDB) indexDB = new IndexDB(kbPath)
    return indexDB
  }

  async function getVectorDB(kbPath: string): Promise<VectorDB> {
    if (!vectorDB) {
      vectorDB = new VectorDB(kbPath)
      await vectorDB.initialize()
    }
    return vectorDB
  }

  async function getEmbeddingService(): Promise<EmbeddingService> {
    if (!embeddingService) {
      embeddingService = new EmbeddingService()
      await embeddingService.initialize()
    }
    return embeddingService
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

  // File operations
  ipcMain.handle('wiki:list', (_event, kbPath: string) => {
    return listWikiPages(kbPath)
  })

  ipcMain.handle('wiki:read', (_event, kbPath: string, subpath: string) => {
    return readFile(resolveSafePath(kbPath, subpath))
  })

  ipcMain.handle('wiki:write', (_event, kbPath: string, subpath: string, content: string) => {
    writeFile(resolveSafePath(kbPath, subpath), content)
    return { success: true }
  })

  ipcMain.handle('wiki:delete', (_event, kbPath: string, subpath: string) => {
    deleteFile(resolveSafePath(kbPath, subpath))
    return { success: true }
  })

  ipcMain.handle('wiki:backlinks', (_event, kbPath: string, pageName: string) => {
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
    const logPath = path.join(kbPath, '.ai-notes', 'compile-log.json')
    if (!fs.existsSync(logPath)) return { compiled: false }
    try {
      const log = JSON.parse(fs.readFileSync(logPath, 'utf-8'))
      const entry = log[rawFileName]
      return entry ? { compiled: true, wikiPages: entry.pages, compiledAt: entry.at } : { compiled: false }
    } catch (err) {
      console.error('Failed to read compile-log.json:', err)
      return { compiled: false }
    }
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
  ipcMain.handle('graph:data', (_event, kbPath: string) => {
    const fs = require('fs')
    const path = require('path')
    const wikiDir = path.join(kbPath, 'wiki')
    if (!fs.existsSync(wikiDir)) return { nodes: [], edges: [] }

    const nodes: { id: string; label: string; linkCount: number }[] = []
    const edges: { source: string; target: string }[] = []
    const linkCount: Record<string, number> = {}

    const files = fs.readdirSync(wikiDir).filter((f: string) => f.endsWith('.md'))
    for (const file of files) {
      const name = file.replace('.md', '')
      const content = fs.readFileSync(path.join(wikiDir, file), 'utf-8')
      for (const target of extractLinks(content)) {
        edges.push({ source: name, target })
        linkCount[name] = (linkCount[name] || 0) + 1
        linkCount[target] = (linkCount[target] || 0) + 1
      }
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
  ipcMain.handle('search:build', (_event, kbPath: string) => {
    const fs = require('fs')
    const path = require('path')
    const wikiDir = path.join(kbPath, 'wiki')
    if (!fs.existsSync(wikiDir)) return { success: false }

    const pages = fs.readdirSync(wikiDir)
      .filter((f: string) => f.endsWith('.md'))
      .map((f: string) => ({
        name: f.replace('.md', ''),
        content: fs.readFileSync(path.join(wikiDir, f), 'utf-8'),
      }))

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
    const rawDir = path.join(kbPath, 'raw')
    if (!fs.existsSync(rawDir)) fs.mkdirSync(rawDir, { recursive: true })

    for (const sample of SAMPLE_FILES) {
      const destPath = path.join(rawDir, sample.name)
      if (!fs.existsSync(destPath)) {
        fs.writeFileSync(destPath, sample.content, 'utf-8')
      }
    }

    // Initialize tracking manifest
    const manifestPath = path.join(kbPath, '.ai-notes', 'sample-pages.json')
    fs.writeFileSync(manifestPath, '[]', 'utf-8')

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
    if (fs.existsSync(wikiDir)) {
      for (const pageName of pages) {
        const pagePath = path.join(wikiDir, `${pageName}.md`)
        if (fs.existsSync(pagePath)) fs.unlinkSync(pagePath)
      }
    }

    // Remove manifest
    if (fs.existsSync(manifestPath)) fs.unlinkSync(manifestPath)

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
  ipcMain.handle('index:rebuild', async (_event, kbPath: string) => {
    const rebuilder = new IndexRebuilder(kbPath)
    return rebuilder.rebuild()
  })

  ipcMain.handle('index:status', (_event, kbPath: string) => {
    const db = getIndexDB(kbPath)
    const pages = db.listPages().length
    const sources = db.listSources().length
    const lastRebuild = db.getSetting('last_rebuild', '从未')
    return { pages, sources, lastRebuild }
  })

  // Semantic compile & QA (v2)
  ipcMain.handle('llm:compile-v2', async (_event, kbPath: string, rawFilePath: string) => {
    const db = getIndexDB(kbPath)
    const vdb = await getVectorDB(kbPath)
    const embedding = await getEmbeddingService()
    return incrementalCompile(rawFilePath, kbPath, embedding, db, vdb)
  })

  ipcMain.handle('llm:qa-v2', async (_event, kbPath: string, question: string) => {
    const db = getIndexDB(kbPath)
    const vdb = await getVectorDB(kbPath)
    const embedding = await getEmbeddingService()
    return semanticQA(question, kbPath, embedding, db, vdb)
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
}
