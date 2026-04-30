import fs from 'fs'
import path from 'path'

const DEFAULT_SYSTEM = `# 系统指令

你是"知译 KnowCompile"的知识编译助手。你的任务是帮助用户将原始资料转化为结构化、可查询的知识页面。

## 基本原则

1. 使用简体中文回复
2. 保持客观，明确区分事实和观点
3. 遇到矛盾信息时明确标注，不掩盖
4. 所有结论必须标注来源
5. 使用 [[双向链接]] 连接相关概念
`

const DEFAULT_COMPILE_RULES = `# 编译规则

## 何时编译

- 用户将新文件放入 raw/ 目录后手动触发
- 用户请求重新编译某个页面时

## 页面拆分规则

- 每个独立概念一个页面，概念的判断标准：是否值得单独成为一个百科条目
- 如果多个小概念紧密围绕同一个主题，应合并为一个页面，用 ## 标题组织
- 页面标题使用中文，简洁明确

## 链接规则（重要）

- 只对"确实需要独立成页"的概念使用 [[双向链接]]
- 一个页面内对同一概念的链接只出现一次（首次出现时）
- 不要将页面内的子标题作为链接目标（例如不要在"模型选择"页面里反复链接 [[模型选择]] 到自己）
- 如果目标页面还不存在但确实值得独立成页，才创建链接
- 不要为了链接而链接——宁可少链，不要滥链

## 矛盾检测

- 当新资料与现有 wiki 页面内容冲突时，在页面中标注 ⚠ 矛盾提示
- 标注格式：⚠ 矛盾：[描述矛盾内容]（来源A vs 来源B）
`

const DEFAULT_STYLE_GUIDE = `# 文风指南

## 页面格式

- 使用 # 一级标题作为页面标题（每页仅一个）
- 使用 ## 和 ### 组织内容层级
- 正文使用自然段落，避免过度使用列表
- 来源引用使用行内格式："> 来源：文件名"，放在段落或章节末尾

## 引用格式

- 在一个章节末尾统一标注来源，不要使用学术脚注（如 [^1] 或 ↩）
- 来源标注简洁即可：> 来源：xxx

## 链接规范

- 只在"相关主题"章节集中放置 [[链接]]，正文中尽量少放
- 同一个链接在一个页面中最多出现一次
- 不要链接页面自身的标题
- 链接使用 [[页面名]] 格式

## 中文规范

- 使用简体中文
- 术语保持统一（如"量子比特"而非混用"量子位元"）
- 英文术语首次出现时附中文翻译
`

const DEFAULT_LINKS_RULES = `# 链接规则

## 何时创建链接

- 两个概念有直接关联时建立双向链接
- 概念A是概念B的子概念时建立父子链接
- 概念A和B属于同一类别时建立同类链接

## 链接格式

- 使用 [[页面名]] 创建内部链接
- 链接目标页面不存在时标注为红色（待创建）
`

const DEFAULT_SCHEMA: Record<string, string> = {
  'system.md': DEFAULT_SYSTEM,
  'compile-rules.md': DEFAULT_COMPILE_RULES,
  'style-guide.md': DEFAULT_STYLE_GUIDE,
  'links-rules.md': DEFAULT_LINKS_RULES,
}

export function initKnowledgeBase(basePath: string): { success: boolean; error?: string } {
  try {
    const dirs = ['raw', 'wiki', 'schema', '.ai-notes']
    for (const dir of dirs) {
      const dirPath = path.join(basePath, dir)
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true })
      }
    }

    for (const [filename, content] of Object.entries(DEFAULT_SCHEMA)) {
      const filePath = path.join(basePath, 'schema', filename)
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, content, 'utf-8')
      }
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

export function getKBPath(): string | null {
  const { app } = require('electron')
  const configPath = path.join(app.getPath('userData'), 'config.json')
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      return config.kbPath || null
    } catch {
      return null
    }
  }
  return null
}

export function setKBPath(kbPath: string): void {
  const { app } = require('electron')
  const configPath = path.join(app.getPath('userData'), 'config.json')
  const config = { kbPath }
  const dir = path.dirname(configPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
}
