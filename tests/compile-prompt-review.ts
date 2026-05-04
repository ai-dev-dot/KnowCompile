/**
 * Compile Prompt Quality Review
 *
 * Uses the REAL schema prompt (from kbPath/schema/) and real raw files to
 * test whether the current compile prompts produce quality wiki pages.
 *
 * Usage: npx tsx tests/compile-prompt-review.ts <kbPath> [rawFile1 rawFile2 ...]
 *
 * If no raw files specified, tests 3 representative files.
 */
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { compileNewPages } from '../electron/llm-service'
import { validateMultiPage, type ValidationReport } from '../electron/compile-validator'
import { loadSchemaPrompt } from '../electron/schema-loader'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadSettings() {
  const sp = path.join(os.homedir(), 'AppData', 'Roaming', 'knowcompile', 'settings.json')
  if (!fs.existsSync(sp)) throw new Error('未找到 LLM 配置，请先在应用中配置')
  const { llm } = JSON.parse(fs.readFileSync(sp, 'utf-8'))
  if (!llm?.apiKey) throw new Error('API key 未配置')
  return {
    provider: llm.provider || 'openai',
    apiKey: llm.apiKey,
    baseURL: llm.baseURL || '',
    model: llm.model || 'gpt-4o',
  }
}

function fmtDuration(ms: number) { return `${(ms / 1000).toFixed(1)}s` }

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const kbPath = process.argv[2]
  if (!kbPath || !fs.existsSync(kbPath)) {
    console.error('Usage: npx tsx tests/compile-prompt-review.ts <kbPath> [rawFiles...]')
    console.error('  kbPath must contain schema/ and raw/ directories')
    process.exit(1)
  }

  const rawDir = path.join(kbPath, 'raw')
  const schemaDir = path.join(kbPath, 'schema')
  if (!fs.existsSync(rawDir)) { console.error(`raw/ not found in ${kbPath}`); process.exit(1) }
  if (!fs.existsSync(schemaDir)) { console.error(`schema/ not found in ${kbPath}`); process.exit(1) }

  // Determine which files to test
  const specified = process.argv.slice(2).filter(a => a !== kbPath)
  let targets: string[]
  if (specified.length > 0) {
    targets = specified.map(f => path.join(rawDir, path.basename(f)))
  } else {
    // Default: pick 3 representative files
    const allMd = fs.readdirSync(rawDir).filter(f => f.endsWith('.md'))
    const picks = allMd.filter(f => !f.startsWith('sample-')).slice(0, 4)
    if (picks.length === 0) {
      picks.push(...allMd.slice(0, 3))
    }
    targets = picks.map(f => path.join(rawDir, f))
  }

  // Validate targets exist
  const valid = targets.filter(t => {
    if (!fs.existsSync(t)) { console.error(`文件不存在: ${t}`); return false }
    const size = fs.statSync(t).size
    if (size > 50_000) { console.error(`文件过大 (${(size/1024).toFixed(0)}KB): ${path.basename(t)}`); return false }
    return true
  })
  if (valid.length === 0) { console.error('没有可用的测试文件'); process.exit(1) }

  const settings = loadSettings()
  console.log('='.repeat(70))
  console.log(`编译提示词质量评审`)
  console.log(`模型: ${settings.provider} / ${settings.model}`)
  console.log(`知识库: ${kbPath}`)
  console.log(`测试文件数: ${valid.length}`)
  console.log('='.repeat(70))

  // Show the prompt being tested
  const schemaPrompt = loadSchemaPrompt(kbPath)
  console.log(`\n📋 当前系统提示词 (${(schemaPrompt.length / 1024).toFixed(1)}KB):`)
  console.log('─'.repeat(70))
  console.log(schemaPrompt)
  console.log('─'.repeat(70))

  // Parse existing wiki titles for dedup context
  const wikiDir = path.join(kbPath, 'wiki')
  const existingTitles: string[] = fs.existsSync(wikiDir)
    ? fs.readdirSync(wikiDir).filter((f: string) => f.endsWith('.md')).map((f: string) => f.replace('.md', ''))
    : []
  if (existingTitles.length > 0) {
    console.log(`\n已有 ${existingTitles.length} 个 Wiki 页面: ${existingTitles.slice(0, 10).join(', ')}${existingTitles.length > 10 ? '...' : ''}`)
  }

  // -----------------------------------------------------------------------
  // Run compile for each file
  // -----------------------------------------------------------------------
  const allReports: { file: string; size: number; durationMs: number; reports: ValidationReport[]; overallScore: number }[] = []

  for (let i = 0; i < valid.length; i++) {
    const filePath = valid[i]
    const fileName = path.basename(filePath)
    const rawContent = fs.readFileSync(filePath, 'utf-8')
    const sizeKB = (rawContent.length / 1024).toFixed(1)

    console.log(`\n${'='.repeat(70)}`)
    console.log(`[${i + 1}/${valid.length}] 编译: ${fileName} (${sizeKB}KB)`)
    console.log(`${'='.repeat(70)}`)

    const t0 = Date.now()
    let output: string
    try {
      output = await compileNewPages(rawContent, fileName, existingTitles, kbPath, settings)
    } catch (err: any) {
      console.log(`  ❌ 编译失败: ${err?.message || String(err)}`)
      allReports.push({ file: fileName, size: rawContent.length, durationMs: Date.now() - t0, reports: [], overallScore: 0 })
      continue
    }
    const durationMs = Date.now() - t0

    // Validate
    const validation = validateMultiPage(output)

    console.log(`\n  耗时: ${fmtDuration(durationMs)} | 生成页面数: ${validation.reports.length} | 总分: ${validation.overallScore}/100`)
    console.log('─'.repeat(70))

    // Show raw output sections (first 400 chars each) for debugging
    const sections = output.split(/(?=^---|^# )/m).filter(s => s.trim())
    for (let si = 0; si < sections.length; si++) {
      const preview = sections[si].slice(0, 400).replace(/\n/g, '\\n')
      console.log(`\n  --- 原始输出 #${si + 1} ---`)
      console.log(`  ${preview}${sections[si].length > 400 ? '...' : ''}`)
    }

    for (const r of validation.reports) {
      const icon = r.score >= 80 ? '✅' : r.score >= 60 ? '⚠️' : '❌'
      console.log(`\n  ${icon} ${r.pageName}: ${r.score}/100 (${r.failed} 错, ${r.warnings} 警)`)
      for (const iss of r.issues) {
        const s = iss.severity === 'error' ? '❌' : '⚡'
        console.log(`     ${s} [${iss.rule}] ${iss.message}`)
      }
    }

    allReports.push({ file: fileName, size: rawContent.length, durationMs, reports: validation.reports, overallScore: validation.overallScore })
  }

  // -----------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------
  console.log(`\n${'='.repeat(70)}`)
  console.log(`评审总结`)
  console.log(`${'='.repeat(70)}`)

  const passed = allReports.filter(r => r.overallScore >= 80)
  const borderline = allReports.filter(r => r.overallScore >= 60 && r.overallScore < 80)
  const failed = allReports.filter(r => r.overallScore < 60)

  console.log(`\n| 文件 | 大小 | 耗时 | 页数 | 总分 | 判定 |`)
  console.log('|------|------|------|------|------|------|')
  for (const r of allReports) {
    const verdict = r.overallScore >= 80 ? '✅ 合格' : r.overallScore >= 60 ? '⚠️ 待改进' : '❌ 不合格'
    console.log(`| ${r.file.slice(0, 35)} | ${(r.size / 1024).toFixed(1)}KB | ${fmtDuration(r.durationMs)} | ${r.reports.length} | ${r.overallScore} | ${verdict} |`)
  }

  const avgScore = allReports.length > 0
    ? Math.round(allReports.reduce((s, r) => s + r.overallScore, 0) / allReports.length)
    : 0

  console.log(`\n  通过 (≥80): ${passed.length}  待改进 (60-79): ${borderline.length}  不合格 (<60): ${failed.length}`)
  console.log(`  平均分: ${avgScore}/100`)
  if (avgScore >= 80) {
    console.log(`\n  ✅ 编译提示词质量达标`)
  } else {
    console.log(`\n  ❌ 编译提示词需要改进 — 主要问题:`)
    const allIssues = allReports.flatMap(r => r.reports.flatMap(p => p.issues))
    const byRule = new Map<string, number>()
    for (const iss of allIssues) {
      byRule.set(iss.rule, (byRule.get(iss.rule) || 0) + 1)
    }
    const sorted = [...byRule.entries()].sort((a, b) => b[1] - a[1])
    for (const [rule, count] of sorted.slice(0, 5)) {
      console.log(`    - ${rule}: ${count} 次`)
    }
  }
  console.log()
}

main().catch(err => {
  console.error('评审脚本失败:', err)
  process.exit(1)
})
