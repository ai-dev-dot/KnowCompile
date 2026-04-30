import fs from 'fs'
import path from 'path'

const DEFAULT_SYSTEM = `# 系统指令

## 身份

你是"知译 KnowCompile"的知识维护 Agent。你的职责是将 raw/ 中的原始资料编译为结构化 Wiki 页面。

## 核心原则

1. **溯源优先**：每句话都能追溯到 raw/ 中的原始资料。不编造、不推测。
2. **编译而非检索**：把资料"编译"成知识，而非每次查询时临时翻文档。
3. **中文输出**：使用简体中文。英文术语首次出现时附中文翻译。
4. **标注不确定性**：不确定处显式标注 [待确认]，矛盾处标注 ⚠。
5. **原子页面**：每个页面只覆盖一个概念，不超过 200 行。
`

const DEFAULT_COMPILE_RULES = `# 编译规则

## 两步流程

1. **分析**：识别核心概念、与已有页面的关联、矛盾。决定创建/更新几个页面。
2. **生成**：按以下模板生成 Wiki 页面。

## 页面格式（严格遵循）

每个页面必须按此格式输出：

---
type: concept
tags: [标签1, 标签2]
sources:
  - 源文件名
updated: 2026-04-30
---

# 页面标题

> 来源：源文件名

## 定义

一句话说明这个概念是什么。

## 核心内容

用自然段落阐述。必要时使用列表或表格。

## 相关主题

- [[相关概念A]]
- [[相关概念B]]

注意：
1. 开头的 "---" 和结尾的 "---" 是 YAML frontmatter 标记，不能省略
2. 来源引用 "> 来源：xxx" 放在标题后、正文前
3. 只在"相关主题"章节使用 [[链接]]
4. 同一链接不重复出现
5. 不链接自身标题
6. 编译后生成 index.md 索引文件

## 矛盾处理

当新资料与已有 Wiki 内容冲突时：⚠ 矛盾：[描述]（来源A vs 来源B）
`

const DEFAULT_STYLE_GUIDE = `# 文风指南

## 页面格式

- YAML frontmatter 后紧接 # 页面标题、> 来源引用、正文
- 使用 ## 组织内容层级
- 正文使用自然段落，避免过度列表
- 中文术语保持统一

## 禁止事项

- 禁止在正文中插入 [[链接]]（只在"相关主题"章节使用）
- 禁止使用学术脚注（[^1]、↩ 等）
- 禁止创建内容少于 5 行的占位页面
`

const DEFAULT_LINKS_RULES = `# 链接规则

## 何时创建链接

- 目标是一个独立概念，值得单独成页
- 目标是已有 Wiki 页面
- 链接能帮助读者理解上下文

## 索引维护

每次编译后更新 index.md，按类型分组列出所有页面 + 一行摘要。
`

const DEFAULT_SCHEMA: Record<string, string> = {
  'system.md': DEFAULT_SYSTEM,
  'compile-rules.md': DEFAULT_COMPILE_RULES,
  'style-guide.md': DEFAULT_STYLE_GUIDE,
  'links-rules.md': DEFAULT_LINKS_RULES,
}

export const SCHEMA_VERSION = 2

function writeVersion(basePath: string): void {
  const versionPath = path.join(basePath, '.ai-notes', 'schema-version')
  fs.writeFileSync(versionPath, String(SCHEMA_VERSION), 'utf-8')
}

function readVersion(basePath: string): number {
  const versionPath = path.join(basePath, '.ai-notes', 'schema-version')
  if (!fs.existsSync(versionPath)) return 0
  try { return parseInt(fs.readFileSync(versionPath, 'utf-8').trim(), 10) || 0 } catch { return 0 }
}

export function checkSchemaUpdate(basePath: string): { updateAvailable: boolean; currentVersion: number; latestVersion: number } {
  const current = readVersion(basePath)
  return { updateAvailable: current < SCHEMA_VERSION, currentVersion: current, latestVersion: SCHEMA_VERSION }
}

export function updateSchema(basePath: string): { success: boolean; updated: string[]; error?: string } {
  try {
    const updated: string[] = []
    for (const [filename, content] of Object.entries(DEFAULT_SCHEMA)) {
      fs.writeFileSync(path.join(basePath, 'schema', filename), content, 'utf-8')
      updated.push(filename)
    }
    writeVersion(basePath)
    return { success: true, updated }
  } catch (error) { return { success: false, updated: [], error: String(error) } }
}

export function initKnowledgeBase(basePath: string): { success: boolean; error?: string } {
  try {
    for (const dir of ['raw', 'wiki', 'schema', '.ai-notes']) {
      const dirPath = path.join(basePath, dir)
      if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true })
    }
    for (const [filename, content] of Object.entries(DEFAULT_SCHEMA)) {
      const filePath = path.join(basePath, 'schema', filename)
      if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, content, 'utf-8')
    }
    writeVersion(basePath)
    return { success: true }
  } catch (error) { return { success: false, error: String(error) } }
}

export function getKBPath(): string | null {
  const { app } = require('electron')
  const configPath = path.join(app.getPath('userData'), 'config.json')
  if (fs.existsSync(configPath)) {
    try { const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')); return config.kbPath || null } catch { return null }
  }
  return null
}

export function setKBPath(kbPath: string): void {
  const { app } = require('electron')
  const configPath = path.join(app.getPath('userData'), 'config.json')
  const dir = path.dirname(configPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(configPath, JSON.stringify({ kbPath }, null, 2), 'utf-8')
}
