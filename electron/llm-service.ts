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
  return text.replace(/<\s*think\s*>[\s\S]*?<\/\s*think\s*>/gi, '').trim()
}

export async function chat(
  messages: ChatMessage[],
  overrideSettings?: { provider: string; apiKey: string; baseURL: string; model: string },
): Promise<string> {
  const settings = overrideSettings || getSettings().llm

  if (settings.provider === 'anthropic') {
    const client = new Anthropic({ apiKey: settings.apiKey })
    const systemMsg = messages
      .filter(m => m.role === 'system')
      .map(m => m.content)
      .join('\n')
    const otherMsgs = messages.filter(m => m.role !== 'system')
    const resp = await client.messages.create({
      model: settings.model,
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
    apiKey: settings.apiKey,
    baseURL: settings.baseURL || undefined,
  })
  const resp = await client.chat.completions.create({
    model: settings.model,
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
    { role: 'user', content: `分析以下资料，识别核心概念、与已有页面的关联、页面拆分建议。只输出分析，不生成页面。\n\n## 资料：${rawFileName}\n\n${rawContent.slice(0, 8000)}\n${existingList}` },
  ]

  const analysis = await chat(analysisPrompt)

  // Step 2: Generation
  const generationPrompt: ChatMessage[] = [
    { role: 'system', content: fullSchema },
    { role: 'user', content: `根据分析结果生成 Wiki 页面。严格遵循页面格式模板（---开头、# 标题、> 来源：${rawFileName}、## 定义、## 核心内容、## 相关主题）。同时生成 index.md。\n\n## 资料：${rawFileName}\n\n${rawContent.slice(0, 8000)}\n${existingList}\n\n## 分析\n${analysis}` },
  ]

  return chat(generationPrompt)
}
