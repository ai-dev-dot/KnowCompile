// Compile output quality validator
// Checks format and content quality of LLM-generated wiki pages

export interface ValidationIssue {
  severity: 'error' | 'warn'
  rule: string
  message: string
}

export interface ValidationReport {
  pageName: string
  passed: number
  failed: number
  warnings: number
  issues: ValidationIssue[]
  score: number // 0-100
}

function parseFrontmatter(content: string): { raw: string; fields: Record<string, any> } | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return null
  const raw = match[1]
  const fields: Record<string, any> = {}
  for (const line of raw.split('\n')) {
    const kv = line.match(/^(\w+):\s*(.+)$/)
    if (kv) {
      const key = kv[1].trim()
      let val: any = kv[2].trim()
      if (val.startsWith('[') && val.endsWith(']')) {
        val = val.slice(1, -1).split(',').map((s: string) => s.trim().replace(/['"]/g, ''))
      }
      fields[key] = val
    }
  }
  return { raw, fields }
}

function extractLinks(content: string): string[] {
  const links: string[] = []
  const pattern = /\[\[([^\]]+)\]\]/g
  let match
  while ((match = pattern.exec(content)) !== null) {
    links.push(match[1])
  }
  return links
}

function hasSection(content: string, sectionName: string): boolean {
  return new RegExp(`^## ${sectionName}`, 'm').test(content)
}

export function validateCompileOutput(content: string, pageName: string): ValidationReport {
  const issues: ValidationIssue[] = []

  // 1. YAML frontmatter
  const fm = parseFrontmatter(content)
  if (!fm) {
    issues.push({ severity: 'error', rule: 'frontmatter', message: '缺少 YAML frontmatter（必须以 --- 开头和结尾）' })
  } else {
    const required = ['type', 'sources']
    for (const field of required) {
      if (!fm.fields[field]) {
        issues.push({ severity: 'error', rule: 'frontmatter', message: `frontmatter 缺少必需字段: ${field}` })
      }
    }
    if (fm.fields.type && !['concept', 'entity', 'synthesis'].includes(fm.fields.type)) {
      issues.push({ severity: 'warn', rule: 'frontmatter', message: `type 应为 concept/entity/synthesis，当前为: ${fm.fields.type}` })
    }
    if (fm.fields.sources && (!Array.isArray(fm.fields.sources) || fm.fields.sources.length === 0)) {
      issues.push({ severity: 'warn', rule: 'frontmatter', message: 'sources 数组为空' })
    }
    if (!fm.fields.updated) {
      issues.push({ severity: 'warn', rule: 'frontmatter', message: '缺少 updated 字段' })
    }
    if (!fm.fields.tags) {
      issues.push({ severity: 'warn', rule: 'frontmatter', message: '缺少 tags 字段' })
    }
  }

  // 2. No thinking tags
  if (/<think>/i.test(content)) {
    issues.push({ severity: 'error', rule: 'no-think-tags', message: '输出中包含 <think> 推理标签，未被过滤' })
  }

  // 3. Single # title
  const h1Matches = content.match(/^# /gm)
  if (!h1Matches || h1Matches.length === 0) {
    issues.push({ severity: 'error', rule: 'single-title', message: '缺少 "# 标题" 一级标题' })
  } else if (h1Matches.length > 1) {
    issues.push({ severity: 'error', rule: 'single-title', message: `有 ${h1Matches.length} 个一级标题，每页应只有一个` })
  }

  // 4. Link discipline — links should be concentrated in "相关主题" section
  const links = extractLinks(content)
  const bodyWithoutRelated = content.replace(/## 相关主题[\s\S]*$/, '')
  const bodyLinks = extractLinks(bodyWithoutRelated)

  if (bodyLinks.length > 0 && !hasSection(content, '相关主题')) {
    issues.push({ severity: 'warn', rule: 'link-discipline', message: `正文中有 ${bodyLinks.length} 个链接但没有"相关主题"章节` })
  }
  if (bodyLinks.length > 3) {
    issues.push({ severity: 'warn', rule: 'link-discipline', message: `正文中有 ${bodyLinks.length} 个链接，建议集中在"相关主题"` })
  }

  // 5. No duplicate links
  const seen = new Set<string>()
  const dupes: string[] = []
  for (const link of links) {
    if (seen.has(link)) dupes.push(link)
    seen.add(link)
  }
  if (dupes.length > 0) {
    issues.push({ severity: 'error', rule: 'no-duplicate-links', message: `重复链接: ${dupes.join(', ')}` })
  }

  // 6. No self-links
  if (links.includes(pageName)) {
    issues.push({ severity: 'error', rule: 'no-self-links', message: `页面链接到了自己: [[${pageName}]]` })
  }

  // 7. Source format
  const sourceMatches = content.match(/^> \s*来源[：:]/gm)
  if (!sourceMatches || sourceMatches.length === 0) {
    issues.push({ severity: 'warn', rule: 'source-format', message: '缺少 "> 来源：xxx" 格式的来源引用' })
  }

  // 8. No academic footnotes
  if (/\[\^\d+\]/g.test(content) || /↩/g.test(content)) {
    issues.push({ severity: 'error', rule: 'no-footnotes', message: '包含学术脚注格式（[^1] 或 ↩），应使用 "> 来源："' })
  }

  // 9. Page length
  const lines = content.split('\n').length
  if (lines < 10) {
    issues.push({ severity: 'warn', rule: 'page-length', message: `页面只有 ${lines} 行，内容过少` })
  }
  if (lines > 300) {
    issues.push({ severity: 'warn', rule: 'page-length', message: `页面有 ${lines} 行，建议不超过 200 行` })
  }

  // 10. No duplicate frontmatter in body (LLM sometimes leaks metadata to the end)
  const fmCount = (content.match(/^---\n(\w+:[\s\S])/gm) || []).length
  if (fmCount > 1) {
    issues.push({ severity: 'error', rule: 'no-dup-frontmatter', message: `检测到 ${fmCount} 个 YAML frontmatter 块（应只有一个在开头）` })
  }

  // 11. Has required template sections based on type
  const pageType = fm?.fields?.type
  if (pageType === 'concept') {
    if (!hasSection(content, '定义')) {
      issues.push({ severity: 'warn', rule: 'template-concept', message: 'Concept 页面应包含 ## 定义 章节' })
    }
  } else if (pageType === 'entity') {
    if (!hasSection(content, '概述')) {
      issues.push({ severity: 'warn', rule: 'template-entity', message: 'Entity 页面应包含 ## 概述 章节' })
    }
  }

  // Calculate score
  const errors = issues.filter(i => i.severity === 'error').length
  const warns = issues.filter(i => i.severity === 'warn').length
  const score = Math.max(0, 100 - errors * 20 - warns * 5)

  return {
    pageName,
    passed: 10 - errors - warns,
    failed: errors,
    warnings: warns,
    issues,
    score: Math.round(score),
  }
}

export function validateMultiPage(output: string): { reports: ValidationReport[]; overallScore: number } {
  const sections = output.split(/(?=^# )/m).filter(s => s.trim())
  const reports: ValidationReport[] = []

  for (const section of sections) {
    const titleMatch = section.match(/^# (.+)$/m)
    const pageName = titleMatch ? titleMatch[1].trim() : 'unknown'
    // Skip index page
    if (pageName === 'Wiki 索引' || pageName.toLowerCase() === 'wiki index') continue
    reports.push(validateCompileOutput(section, pageName))
  }

  const overallScore = reports.length > 0
    ? Math.round(reports.reduce((sum, r) => sum + r.score, 0) / reports.length)
    : 0

  return { reports, overallScore }
}
