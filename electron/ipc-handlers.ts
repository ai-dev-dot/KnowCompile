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
import { getSettings, saveSettings } from './settings-store'
import { buildIndex, search as searchIndex } from './search-indexer'
import { exportHTML, exportMarkdown, backup } from './exporter'
import { SAMPLE_FILES } from './samples'
import { validateCompileOutput, validateMultiPage } from './compile-validator'

export function registerIPCHandlers() {
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

  ipcMain.handle('wiki:read', (_event, filePath: string) => {
    return readFile(filePath)
  })

  ipcMain.handle('wiki:write', (_event, filePath: string, content: string) => {
    writeFile(filePath, content)
    return { success: true }
  })

  ipcMain.handle('wiki:delete', (_event, filePath: string) => {
    deleteFile(filePath)
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

  ipcMain.handle('raw:read', (_event, filePath: string) => {
    return readFile(filePath)
  })

  // Schema
  ipcMain.handle('schema:list', (_event, kbPath: string) => {
    return getSchemaFiles(kbPath)
  })

  ipcMain.handle('schema:write', (_event, filePath: string, content: string) => {
    writeFile(filePath, content)
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
    return getSettings()
  })

  ipcMain.handle('settings:save', (_event, settings) => {
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
    } catch {
      return { compiled: false }
    }
  })

  ipcMain.handle('compile:log', (_event, kbPath: string, rawFileName: string, wikiPages: string[]) => {
    const fs = require('fs')
    const path = require('path')
    const logPath = path.join(kbPath, '.ai-notes', 'compile-log.json')
    let log: Record<string, { pages: string[]; at: string }> = {}
    if (fs.existsSync(logPath)) {
      try { log = JSON.parse(fs.readFileSync(logPath, 'utf-8')) } catch { log = {} }
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

        const systemPath = require('path').join(kbPath, 'schema', 'system.md')
        const rulesPath = require('path').join(kbPath, 'schema', 'compile-rules.md')
        const stylePath = require('path').join(kbPath, 'schema', 'style-guide.md')
        const fs = require('fs')
        const schema = [
          fs.existsSync(systemPath) ? fs.readFileSync(systemPath, 'utf-8') : '',
          fs.existsSync(rulesPath) ? fs.readFileSync(rulesPath, 'utf-8') : '',
          fs.existsSync(stylePath) ? fs.readFileSync(stylePath, 'utf-8') : '',
        ].join('\n\n')

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

  // LLM Q&A
  ipcMain.handle('llm:qa', async (_event, kbPath: string, question: string, contextPages: string[]) => {
    const fs = require('fs')
    const path = require('path')

    const contextContent = contextPages.map((pageName: string) => {
      const p = path.join(kbPath, 'wiki', `${pageName}.md`)
      if (fs.existsSync(p)) return fs.readFileSync(p, 'utf-8')
      return ''
    }).join('\n\n---\n\n')

    const systemPath = path.join(kbPath, 'schema', 'system.md')
    const systemContent = fs.existsSync(systemPath)
      ? fs.readFileSync(systemPath, 'utf-8')
      : ''

    return chat([
      { role: 'system', content: `${systemContent}\n\n你是一个基于已有知识库的问答助手。请根据提供的 Wiki 页面内容回答问题，引用来源。如果知识库中没有相关信息，请如实说明。\n\n## 知识库内容\n${contextContent}` },
      { role: 'user', content: question },
    ])
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
      const pattern = /\[\[([^\]]+)\]\]/g
      let match
      while ((match = pattern.exec(content)) !== null) {
        const target = match[1]
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

  ipcMain.handle('search:query', (_event, query: string) => {
    return searchIndex(query)
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
      try { pages = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) } catch { pages = [] }
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
      try { pages = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) } catch { pages = [] }
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
}
