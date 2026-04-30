import { ipcMain, dialog } from 'electron'
import { initKnowledgeBase, getKBPath, setKBPath } from './kb-init'
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
import { chat, compileNewPages } from './llm-service'
import { getSettings, saveSettings } from './settings-store'
import { buildIndex, search as searchIndex } from './search-indexer'

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

  // Settings
  ipcMain.handle('settings:get', () => {
    return getSettings()
  })

  ipcMain.handle('settings:save', (_event, settings) => {
    saveSettings(settings)
    return { success: true }
  })

  // LLM compile
  ipcMain.handle('llm:compile', async (_event, kbPath: string, rawFilePath: string) => {
    const fs = require('fs')
    const path = require('path')
    const rawContent = fs.readFileSync(rawFilePath, 'utf-8')
    const rawName = path.basename(rawFilePath)

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
}
