/**
 * URL content fetcher — fetch a web page and use LLM to extract the main
 * article content as clean Markdown. No turndown dependency needed.
 */
import { getSettings } from './settings-store'
import { chat } from './llm-service'

/**
 * Fetch a URL, extract the HTML body text, and use LLM to produce clean
 * Markdown content. Falls back to raw text extraction if LLM is unavailable.
 */
export async function fetchAndExtract(
  url: string,
  overrideSettings?: { provider: string; apiKey: string; baseURL: string; model: string },
): Promise<{ success: boolean; content?: string; title?: string; error?: string }> {
  // 1. Validate URL
  let parsed: URL
  try {
    parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { success: false, error: '请输入有效的 http/https 网址' }
    }
  } catch {
    return { success: false, error: '请输入有效的网址' }
  }

  // 2. Fetch with timeout
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)

  let html: string
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'KnowCompile/1.0 (knowledge-compiler-bot)' },
    })
    clearTimeout(timeout)
    if (!resp.ok) {
      return { success: false, error: `网页返回错误 (${resp.status})` }
    }
    html = await resp.text()
  } catch (err: any) {
    clearTimeout(timeout)
    if (err?.name === 'AbortError') {
      return { success: false, error: '网页抓取超时，请检查网址或网络连接' }
    }
    return { success: false, error: `网页抓取失败：${err?.message || err}` }
  }

  // 3. Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  const pageTitle = titleMatch ? titleMatch[1].trim() : parsed.hostname

  // 4. Basic text extraction: strip scripts, styles, and tags
  const bodyText = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n')
    .slice(0, 8000) // Limit text to control LLM cost

  if (bodyText.length < 50) {
    return { success: false, error: '网页内容过短，无法提取有效信息' }
  }

  // 5. LLM extraction — convert extracted text to clean Markdown
  try {
    const settings = overrideSettings || getSettings().llm
    const content = await chat([
      {
        role: 'system',
        content: '你是一个网页内容提取器。从给定的网页文本中提取正文内容，输出为干净的中文 Markdown。过滤掉导航、广告、侧边栏、页脚等非正文内容。保留文章标题、段落、列表和重要信息。不要输出任何解释，只输出 Markdown。',
      },
      {
        role: 'user',
        content: `网页标题：${pageTitle}\n\n提取的文本：\n${bodyText}`,
      },
    ], overrideSettings)
    return { success: true, content, title: pageTitle }
  } catch {
    // LLM unavailable — return raw text as fallback
    return { success: true, content: `# ${pageTitle}\n\n> 来源：${url}\n\n${bodyText}`, title: pageTitle }
  }
}
