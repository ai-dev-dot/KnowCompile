import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import fs from 'fs'
import path from 'path'
import { getSettings } from './settings-store'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

function stripThinking(text: string): string {
  return text.replace(/  [\s\S]*? /g, '').trim()
}

export async function chat(messages: ChatMessage[]): Promise<string> {
  const settings = getSettings()

  if (settings.llm.provider === 'anthropic') {
    const client = new Anthropic({ apiKey: settings.llm.apiKey })
    const systemMsg = messages
      .filter(m => m.role === 'system')
      .map(m => m.content)
      .join('\n')
    const otherMsgs = messages.filter(m => m.role !== 'system')
    const resp = await client.messages.create({
      model: settings.llm.model,
      max_tokens: 4096,
      system: systemMsg || undefined,
      messages: otherMsgs.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    })
    return stripThinking(
      resp.content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('\n')
    )
  }

  // OpenAI / custom (MiniMax, DeepSeek, Qwen, etc.)
  const client = new OpenAI({
    apiKey: settings.llm.apiKey,
    baseURL: settings.llm.baseURL || undefined,
  })
  const resp = await client.chat.completions.create({
    model: settings.llm.model,
    messages,
    temperature: 0.3,
  })
  return stripThinking(resp.choices[0]?.message?.content || '')
}

export async function testConnection(settings: {
  provider: string
  apiKey: string
  baseURL: string
  model: string
}): Promise<{ success: boolean; message: string }> {
  try {
    if (settings.provider === 'anthropic') {
      const client = new Anthropic({ apiKey: settings.apiKey })
      const resp = await client.messages.create({
        model: settings.model,
        max_tokens: 50,
        messages: [{ role: 'user', content: 'Hello' }],
      })
      const text = stripThinking(resp.content.filter(c => c.type === 'text').map(c => c.text).join(''))
      return { success: true, message: `连接成功！模型回复: "${text.slice(0, 50)}"` }
    }

    const client = new OpenAI({
      apiKey: settings.apiKey,
      baseURL: settings.baseURL || undefined,
    })
    const resp = await client.chat.completions.create({
      model: settings.model,
      messages: [{ role: 'user', content: 'Hello' }],
      max_tokens: 50,
    })
    const text = stripThinking(resp.choices[0]?.message?.content || '')
    return { success: true, message: `连接成功！模型回复: "${text.slice(0, 50)}"` }
  } catch (err: any) {
    const msg = err?.message || String(err)
    return { success: false, message: `连接失败：${msg}` }
  }
}

export async function compileNewPages(
  rawContent: string,
  rawFileName: string,
  existingWikiTitles: string[],
  kbPath: string,
): Promise<string> {
  const systemPath = path.join(kbPath, 'schema', 'system.md')
  const rulesPath = path.join(kbPath, 'schema', 'compile-rules.md')
  const stylePath = path.join(kbPath, 'schema', 'style-guide.md')
  const linksPath = path.join(kbPath, 'schema', 'links-rules.md')

  const systemContent = fs.existsSync(systemPath) ? fs.readFileSync(systemPath, 'utf-8') : ''
  const rulesContent = fs.existsSync(rulesPath) ? fs.readFileSync(rulesPath, 'utf-8') : ''
  const styleContent = fs.existsSync(stylePath) ? fs.readFileSync(stylePath, 'utf-8') : ''
  const linksContent = fs.existsSync(linksPath) ? fs.readFileSync(linksPath, 'utf-8') : ''

  const fullSchema = `${systemContent}\n\n${rulesContent}\n\n${styleContent}\n\n${linksContent}`

  const existingList = existingWikiTitles.length > 0
    ? `\n## 已有 Wiki 页面\n${existingWikiTitles.map(t => `- ${t}`).join('\n')}`
    : '\n## 已有 Wiki 页面\n（暂无，这是第一个编译任务）'

  // Step 1: Analysis
  const analysisPrompt: ChatMessage[] = [
    { role: 'system', content: fullSchema },
    { role: 'user', content: `## 资料：${rawFileName}\n\n${rawContent.slice(0, 8000)}\n${existingList}\n\n## 任务：分析（不要生成页面）\n\n请分析以上资料，回答：\n\n1. 这份资料包含哪几个核心概念？（每个概念一句话概括）\n2. 这些概念与已有 Wiki 页面有何关联？哪些是全新的，哪些可以补充已有页面？\n3. 建议创建几个新页面，更新几个已有页面？\n4. 有没有与已有页面矛盾的内容？\n\n只做分析，不要输出任何页面内容。` },
  ]

  const analysis = await chat(analysisPrompt)

  // Step 2: Generation
  const generationPrompt: ChatMessage[] = [
    { role: 'system', content: fullSchema },
    { role: 'user', content: `## 资料：${rawFileName}\n\n${rawContent.slice(0, 8000)}\n${existingList}\n\n## 分析结果\n${analysis}\n\n## 任务：生成 Wiki 页面\n\n根据以上分析结果，按编译规则生成 Wiki 页面。要求：\n\n- 每个页面以 YAML frontmatter 开头（type, tags, sources, updated）\n- 页面标题以 "# " 开头\n- 来源引用用 "> 来源：${rawFileName}"\n- 只在"相关主题"章节集中放置 [[链接]]\n- 每个链接最多出现一次\n- 同时生成/更新 wiki/index.md 索引文件` },
  ]

  return chat(generationPrompt)
}
