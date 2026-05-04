const { loadSchemaPrompt } = require('./dist-electron/schema-loader')
const { compileNewPages, chat } = require('./dist-electron/llm-service')
const { validateMultiPage } = require('./dist-electron/compile-validator')
const fs = require('fs')
const path = require('path')

const kbPath = 'E:/my_llm_wiki'
const rawDir = path.join(kbPath, 'raw')

function now() { return new Date().toLocaleTimeString('zh-CN', { hour12: false }) }

function issueSummary(issues) {
  const byRule = {}
  for (const i of issues) {
    if (!byRule[i.rule]) byRule[i.rule] = { errors: 0, warns: 0 }
    byRule[i.rule][i.severity === 'error' ? 'errors' : 'warns']++
  }
  return Object.entries(byRule).map(([rule, c]) =>
    `${rule}(${c.errors > 0 ? '✗' + c.errors : ''}${c.warns > 0 ? ' △' + c.warns : ''})`
  ).join(' ')
}

async function main() {
  const rawFiles = fs.readdirSync(rawDir).filter(f => !f.startsWith('.') && /\.(md|markdown|txt)$/i.test(f))
  const wikiDir = path.join(kbPath, 'wiki')
  const existingTitles = fs.existsSync(wikiDir)
    ? fs.readdirSync(wikiDir).filter(f => f.endsWith('.md')).map(f => f.replace('.md', ''))
    : []

  const totalStart = Date.now()
  console.log(`\n${'═'.repeat(60)}`)
  console.log(` 提示词质量评审 — ${rawFiles.length} 个文件，每文件 ≤3 轮，目标 ≥80 分`)
  console.log(` MiniMax-M2.7 | 开始: ${now()}`)
  console.log(`${'═'.repeat(60)}\n`)

  const allResults = []

  for (let fi = 0; fi < rawFiles.length; fi++) {
    const rawName = rawFiles[fi]
    const rawFilePath = path.join(rawDir, rawName)
    const rawContent = fs.readFileSync(rawFilePath, 'utf-8')

    console.log(`┌─ [${fi + 1}/${rawFiles.length}] ${rawName}`)
    console.log(`│  ${rawContent.length} 字符 | ${rawContent.split('\n').length} 行`)

    const maxIterations = 3
    const targetScore = 80
    let lastOutput = ''
    let bestScore = 0

    for (let i = 0; i < maxIterations; i++) {
      const roundStart = Date.now()
      let compileOutput

      if (i === 0) {
        const promptLen = 8000 + existingTitles.join('').length
        console.log(`├ 第1轮·编译 | prompt ~${(promptLen / 1000).toFixed(1)}k | ${now()}`)
        compileOutput = await compileNewPages(rawContent, rawName, existingTitles, kbPath)
      } else {
        const issues = validateMultiPage(lastOutput)
        const errorList = issues.reports
          .flatMap(r => r.issues.map(iss => `[${iss.severity}] ${iss.rule}: ${iss.message}`))
          .join('\n')

        if (!errorList) {
          console.log(`├ 第${i + 1}轮·跳过 — 无可修复问题`)
          break
        }

        const fixPromptLen = errorList.length + lastOutput.length
        console.log(`├ 第${i + 1}轮·修复 | prompt ~${(fixPromptLen / 1000).toFixed(1)}k | ${now()}`)
        const schema = loadSchemaPrompt(kbPath)
        compileOutput = await chat([
          { role: 'system', content: schema },
          { role: 'user', content: `上一轮的输出有以下质量问题，请逐一修复后重新输出：\n\n${errorList}\n\n上一轮输出：\n${lastOutput}` },
        ], undefined, { kbPath, role: 'compile' })
      }

      const roundMs = Date.now() - roundStart
      lastOutput = compileOutput
      const validation = validateMultiPage(compileOutput)
      const score = validation.overallScore
      if (score > bestScore) bestScore = score

      const sections = compileOutput.split(/(?=^# )/m).filter(s => s.trim())
      const pageCount = sections.length
      const allIssues = validation.reports.flatMap(r => r.issues)

      const icon = score >= 80 ? '✅' : score >= 60 ? '⚠️' : '❌'
      console.log(`│ ${icon} ${score}分 ${pageCount}页 | ${(roundMs / 1000).toFixed(1)}s | 输出 ${(compileOutput.length / 1000).toFixed(1)}k`)
      if (allIssues.length > 0) {
        console.log(`│  问题: ${issueSummary(allIssues)}`)
      }

      if (validation.overallScore >= targetScore) {
        console.log(`│ ✓ 达标`)
        break
      } else if (i < maxIterations - 1) {
        console.log(`│ ↻ 未达标，下一轮修复...`)
      }
    }

    allResults.push({
      rawName, rawSize: rawContent.length, bestScore,
      pages: lastOutput.split(/(?=^# )/m).filter(s => s.trim()).length,
    })
    console.log(`└─ 最高分: ${bestScore}\n`)
  }

  // Summary
  const totalMs = Date.now() - totalStart
  const avgScore = Math.round(allResults.reduce((s, r) => s + r.bestScore, 0) / allResults.length)
  const goodFiles = allResults.filter(r => r.bestScore >= 80)
  const badFiles = allResults.filter(r => r.bestScore < 60)

  console.log(`${'═'.repeat(60)}`)
  console.log(` 结果 | ${now()} | 总耗时 ${(totalMs / 60000).toFixed(1)}min`)
  console.log(` 总分: ${avgScore}/100 | 达标: ${goodFiles.length} | 不及格: ${badFiles.length}`)
  console.log(`${'═'.repeat(60)}\n`)

  for (const r of allResults) {
    const icon = r.bestScore >= 80 ? '✅' : r.bestScore >= 60 ? '⚠️' : '❌'
    console.log(`  ${icon} ${String(r.bestScore).padStart(3)}  ${r.rawName} → ${r.pages} 页`)
  }

  if (badFiles.length > 0) {
    console.log(`\n关键问题: ${badFiles.length} 个文件不及格，提示词仍需改进。`)
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
