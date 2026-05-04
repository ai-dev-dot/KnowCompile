import fs from 'fs'
import path from 'path'

export function listWikiPages(kbPath: string): { name: string; path: string; modifiedAt: string }[] {
  const wikiDir = path.join(kbPath, 'wiki')
  if (!fs.existsSync(wikiDir)) return []

  return fs.readdirSync(wikiDir)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      const fullPath = path.join(wikiDir, f)
      const stat = fs.statSync(fullPath)
      return {
        name: f.replace('.md', ''),
        path: fullPath,
        modifiedAt: stat.mtime.toISOString(),
      }
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
}

export function listRawFiles(kbPath: string): { name: string; path: string; size: number; addedAt: string }[] {
  const rawDir = path.join(kbPath, 'raw')
  if (!fs.existsSync(rawDir)) return []

  return fs.readdirSync(rawDir)
    .filter(f => !f.startsWith('.'))
    .map(f => {
      const fullPath = path.join(rawDir, f)
      const stat = fs.statSync(fullPath)
      return {
        name: f,
        path: fullPath,
        size: stat.size,
        addedAt: stat.birthtime.toISOString(),
      }
    })
}

export function readFile(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8')
}

export function writeFile(filePath: string, content: string): void {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(filePath, content, 'utf-8')
}

export function deleteFile(filePath: string): void {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
  }
}

const SUPPORTED_EXTS = new Set(['.pdf', '.md', '.txt', '.markdown', '.html', '.htm'])
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB

export interface ValidateResult {
  valid: boolean
  error?: string
  /** 'too_large' | 'unsupported_format' | 'duplicate' */
  code?: string
}

export function validateRawFile(kbPath: string, sourcePath: string): ValidateResult {
  const name = path.basename(sourcePath)
  const ext = path.extname(name).toLowerCase()

  if (!SUPPORTED_EXTS.has(ext)) {
    return { valid: false, code: 'unsupported_format', error: `不支持 .${ext} 格式，支持：PDF、Markdown、TXT、HTML` }
  }

  try {
    const stat = fs.statSync(sourcePath)
    if (stat.size > MAX_FILE_SIZE) {
      return { valid: false, code: 'too_large', error: `文件过大（${(stat.size / 1024 / 1024).toFixed(1)}MB），最大支持 50MB` }
    }
  } catch {
    return { valid: false, code: 'unsupported_format', error: '无法读取文件信息' }
  }

  // Check for duplicates
  const rawDir = path.join(kbPath, 'raw')
  const destPath = path.join(rawDir, name)
  if (fs.existsSync(destPath)) {
    return { valid: false, code: 'duplicate', error: `文件 "${name}" 已存在` }
  }

  return { valid: true }
}

export function readRawContent(kbPath: string, fileName: string): string {
  const filePath = path.join(kbPath, 'raw', fileName)
  return fs.readFileSync(filePath, 'utf-8')
}

export function copyToRaw(kbPath: string, sourcePath: string): { success: boolean; name?: string; error?: string } {
  const name = path.basename(sourcePath)
  try {
    const rawDir = path.join(kbPath, 'raw')
    if (!fs.existsSync(rawDir)) {
      fs.mkdirSync(rawDir, { recursive: true })
    }
    const destPath = path.join(rawDir, name)
    fs.copyFileSync(sourcePath, destPath)
    return { success: true, name }
  } catch (error: any) {
    const msg = error?.code === 'ENOENT'
      ? `源文件不存在: ${sourcePath}`
      : error?.code === 'ENOSPC'
        ? '磁盘空间不足'
        : String(error?.message || error)
    return { success: false, name, error: msg }
  }
}

export function extractBacklinks(kbPath: string, pageName: string): string[] {
  const wikiDir = path.join(kbPath, 'wiki')
  if (!fs.existsSync(wikiDir)) return []

  const backlinks: string[] = []
  const linkPattern = /\[\[([^\]]+)\]\]/g

  for (const file of fs.readdirSync(wikiDir)) {
    if (!file.endsWith('.md')) continue
    const rawContent = fs.readFileSync(path.join(wikiDir, file), 'utf-8')
    // Skip code blocks so [[links]] inside examples are not counted
    const content = stripFencedCodeBlocks(rawContent)
    linkPattern.lastIndex = 0
    let match
    while ((match = linkPattern.exec(content)) !== null) {
      if (match[1] === pageName) {
        backlinks.push(file.replace('.md', ''))
        break
      }
    }
  }

  return backlinks
}

/** Strip fenced code blocks so [[links]] inside them are not treated as wiki links */
function stripFencedCodeBlocks(content: string): string {
  return content.replace(/```[\s\S]*?```/g, '')
}

export function extractLinks(content: string): string[] {
  const links: string[] = []
  const pattern = /\[\[([^\]]+)\]\]/g
  // Strip code blocks first so [[...]] inside examples/demos are not extracted
  const cleaned = stripFencedCodeBlocks(content)
  let match
  while ((match = pattern.exec(cleaned)) !== null) {
    links.push(match[1])
  }
  return links
}

export function getSchemaFiles(kbPath: string): { name: string; content: string }[] {
  const schemaDir = path.join(kbPath, 'schema')
  if (!fs.existsSync(schemaDir)) return []

  return fs.readdirSync(schemaDir)
    .filter(f => f.endsWith('.md'))
    .map(f => ({
      name: f,
      content: fs.readFileSync(path.join(schemaDir, f), 'utf-8'),
    }))
}
