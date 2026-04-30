import fs from 'fs'
import path from 'path'
import archiver from 'archiver'

function simpleMarked(content: string): string {
  return content
    .replace(/### (.+)/g, '<h3>$1</h3>')
    .replace(/## (.+)/g, '<h2>$1</h2>')
    .replace(/# (.+)/g, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[\[([^\]]+)\]\]/g, '<a href="$1.html">$1</a>')
    .replace(/> (.+)/g, '<blockquote>$1</blockquote>')
    .split('\n\n').map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('\n')
}

export function exportHTML(kbPath: string): { success: boolean; path?: string; error?: string } {
  try {
    const wikiDir = path.join(kbPath, 'wiki')
    if (!fs.existsSync(wikiDir)) return { success: false, error: 'wiki 目录不存在' }

    const pages = fs.readdirSync(wikiDir).filter(f => f.endsWith('.md'))
    const nav = pages.map(p => `<li><a href="${p.replace('.md', '.html')}">${p.replace('.md', '')}</a></li>`).join('\n')

    const exportDir = path.join(kbPath, '.ai-notes', 'exports', 'html')
    fs.mkdirSync(exportDir, { recursive: true })

    for (const page of pages) {
      const content = fs.readFileSync(path.join(wikiDir, page), 'utf-8')
      const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${page.replace('.md', '')}</title>
<style>body{max-width:800px;margin:0 auto;padding:2em;font-family:sans-serif;line-height:1.8}
a{color:#89b4fa}blockquote{border-left:3px solid #cba6f7;padding-left:1em;color:#585b70}</style></head><body>
<nav><ul>${nav}</ul></nav><hr><article>${simpleMarked(content)}</article></body></html>`
      fs.writeFileSync(path.join(exportDir, page.replace('.md', '.html')), html, 'utf-8')
    }

    const indexHTML = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>AI 笔记 - Wiki</title>
<style>body{max-width:800px;margin:0 auto;padding:2em;font-family:sans-serif;line-height:1.8}</style></head><body>
<h1>Wiki 页面</h1><nav><ul>${nav}</ul></nav></body></html>`
    fs.writeFileSync(path.join(exportDir, 'index.html'), indexHTML, 'utf-8')

    return { success: true, path: exportDir }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

export function exportMarkdown(kbPath: string): { success: boolean; path?: string; error?: string } {
  try {
    const wikiDir = path.join(kbPath, 'wiki')
    const exportDir = path.join(kbPath, '.ai-notes', 'exports', 'markdown')
    fs.mkdirSync(exportDir, { recursive: true })

    const files = fs.readdirSync(wikiDir).filter(f => f.endsWith('.md'))
    for (const file of files) {
      fs.copyFileSync(path.join(wikiDir, file), path.join(exportDir, file))
    }

    return { success: true, path: exportDir }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

export async function backup(kbPath: string): Promise<{ success: boolean; path?: string; error?: string }> {
  return new Promise((resolve) => {
    try {
      const backupDir = path.join(kbPath, '.ai-notes', 'backups')
      fs.mkdirSync(backupDir, { recursive: true })
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const zipPath = path.join(backupDir, `backup-${timestamp}.zip`)

      const output = fs.createWriteStream(zipPath)
      const archive = archiver('zip', { zlib: { level: 9 } })

      output.on('close', () => resolve({ success: true, path: zipPath }))
      archive.on('error', (err) => resolve({ success: false, error: err.message }))

      archive.pipe(output)
      archive.directory(path.join(kbPath, 'wiki'), 'wiki')
      archive.directory(path.join(kbPath, 'raw'), 'raw')
      archive.directory(path.join(kbPath, 'schema'), 'schema')
      archive.finalize()
    } catch (error) {
      resolve({ success: false, error: String(error) })
    }
  })
}
