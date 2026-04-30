import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import fs from 'fs'
import path from 'path'
import { getSettings } from './settings-store'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
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
    return resp.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('\n')
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
  return resp.choices[0]?.message?.content || ''
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
      const text = resp.content.filter(c => c.type === 'text').map(c => c.text).join('')
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
    const text = resp.choices[0]?.message?.content || ''
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

  const systemContent = fs.existsSync(systemPath)
    ? fs.readFileSync(systemPath, 'utf-8')
    : ''
  const rulesContent = fs.existsSync(rulesPath)
    ? fs.readFileSync(rulesPath, 'utf-8')
    : ''

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `${systemContent}\n\n${rulesContent}`,
    },
    {
      role: 'user',
      content: `## 已有 Wiki 页面\n${existingWikiTitles.join('\n') || '（无）'}\n\n## 新资料：${rawFileName}\n\n${rawContent.slice(0, 8000)}\n\n请根据编译规则，将以上资料编译为一个或多个 Wiki 页面。使用 Markdown 格式输出，使用 [[页面名]] 创建内部链接。每个页面的标题以 "# " 开头，来源引用使用 "> 来源：" 格式。`,
    },
  ]

  return chat(messages)
}
