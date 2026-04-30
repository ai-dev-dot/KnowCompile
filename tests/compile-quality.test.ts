/**
 * Compile quality test
 * Usage: npx tsx tests/compile-quality.test.ts <kbPath>
 */
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import OpenAI from 'openai'

const PROMPT = [
  '你是知识编译 Agent。将资料编译为 Wiki 页面。',
  '',
  '每个页面必须严格按以下格式：',
  '',
  '---',
  'type: concept',
  'tags: [标签]',
  'sources:',
  '  - 文件名',
  'updated: 2026-04-30',
  '---',
  '',
  '# 页面标题',
  '',
  '> 来源：文件名',
  '',
  '## 定义',
  '一句话说明。',
  '',
  '## 核心内容',
  '正文段落。',
  '',
  '## 相关主题',
  '- [[概念A]]',
  '- [[概念B]]',
  '',
  '注意：开头的 --- 不能省略。只在"相关主题"用 [[链接]]。不自我链接、不重复链接。',
].join('\n')

// -- Simple validator --
function check(output: string, rawName: string) {
  const pages = output.split(/\n(?=---\ntype:)/).filter((s: string) => s.trim())
  let totalScore = 0

  for (const page of pages) {
    let score = 100
    const nameMatch = page.match(/^# (.+)$/m)
    const name = nameMatch ? nameMatch[1].trim() : '?'

    if (!page.startsWith('---')) { console.log(`  ❌ ${name}: 缺少 YAML frontmatter`); score -= 30 }
    else if (!page.match(/^---\ntype:/)) { console.log(`  ❌ ${name}: frontmatter 格式不正确`); score -= 20 }
    if (!page.match(/> 来源[：:]/)) { console.log(`  ⚠️ ${name}: 缺少来源引用`); score -= 10 }
    const links = [...page.matchAll(/\[\[([^\]]+)\]\]/g)].map((m: any) => m[1])
    if (links.length !== new Set(links).size) { console.log(`  ❌ ${name}: 重复链接`); score -= 20 }
    if (links.includes(name)) { console.log(`  ❌ ${name}: 自我链接`); score -= 20 }
    if (/<think/i.test(page)) { console.log(`  ❌ ${name}: think 标签未过滤`); score -= 20 }
    if (page.split('\n').length < 8) { console.log(`  ⚠️ ${name}: 内容过少`); score -= 10 }

    totalScore += Math.max(0, score)
    console.log(`  ${name}: ${Math.max(0, score)}/100`)
  }
  return pages.length > 0 ? Math.round(totalScore / pages.length) : 0
}

// -- LLM --
function strip(text: string) { return text.replace(/<think[\s\S]*?\/think>/gi, '').trim() }

async function main() {
  const kbPath = process.argv[2]
  if (!kbPath) { console.error('Usage: npx tsx tests/compile-quality.test.ts <kbPath>'); process.exit(1) }

  const sp = path.join(os.homedir(), 'AppData', 'Roaming', 'knowcompile', 'settings.json')
  if (!fs.existsSync(sp)) { console.error('Configure LLM in app first'); process.exit(1) }
  const { llm } = JSON.parse(fs.readFileSync(sp, 'utf-8'))
  if (!llm.apiKey) { console.error('No API key'); process.exit(1) }

  console.log(`${llm.provider} | ${llm.model} | ${kbPath}\n`)
  const c = new OpenAI({ apiKey: llm.apiKey, baseURL: llm.baseURL || undefined })
  const sample = { name: 'test-微服务.md', content: '# 微服务\n\n微服务架构将应用拆分为独立可部署服务。\n\n## 优势\n- 独立部署\n- 技术异构\n- 弹性伸缩\n\n## 挑战\n- 分布式复杂性\n- 服务通信成本\n\n## 相关\n- [[容器化]]\n- [[API网关]]\n' }
  const existing: string[] = []

  for (let iter = 1; iter <= 3; iter++) {
    console.log(`--- Round ${iter} ---`)

    let output: string
    if (iter === 1) {
      const a = await c.chat.completions.create({ model: llm.model, temperature: 0.3, messages: [
        { role: 'system', content: PROMPT },
        { role: 'user', content: `分析以下资料的核心概念和页面拆分建议：\n\n${sample.content.slice(0, 6000)}` },
      ]})
      const analysis = strip(a.choices[0]?.message?.content || '')

      const r = await c.chat.completions.create({ model: llm.model, temperature: 0.3, messages: [
        { role: 'system', content: PROMPT },
        { role: 'user', content: `资料: ${sample.name}\n\n${sample.content.slice(0, 6000)}\n\n分析: ${analysis}\n\n按格式生成 Wiki 页面，来源: "> 来源：${sample.name}"` },
      ]})
      output = strip(r.choices[0]?.message?.content || '')
    } else {
      // Fix round — feed issues back
      const r = await c.chat.completions.create({ model: llm.model, temperature: 0.3, messages: [
        { role: 'system', content: PROMPT },
        { role: 'user', content: `修复输出中的格式问题（缺少 --- 开头的 YAML frontmatter、缺少来源引用、有自我链接等）。重新输出完整页面：\n\n${lastOutput}` },
      ]})
      output = strip(r.choices[0]?.message?.content || '')
    }

    if (iter === 1) { console.log('  First 500 chars:', output.slice(0, 500)) }
    lastOutput = output
    const score = check(output, sample.name)
    console.log(`  Overall: ${score}/100\n`)
    if (score >= 75) { console.log('  ✅ Done'); break }
  }
}

let lastOutput = ''
main().catch(console.error)
