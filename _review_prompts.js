const fs = require('fs')
const path = require('path')

const kbPath = 'E:/my_llm_wiki'
const rawDir = path.join(kbPath, 'raw')

async function main() {
  const { loadSchemaPrompt } = require('./electron/schema-loader')
  const { compileNewPages } = require('./electron/llm-service')
  const { validateMultiPage } = require('./electron/compile-validator')

  const rawFiles = fs.readdirSync(rawDir).filter(f => !f.startsWith('.') && /\.(md|markdown|txt)$/i.test(f))
  const wikiDir = path.join(kbPath, 'wiki')
  const existingTitles = fs.existsSync(wikiDir)
    ? fs.readdirSync(wikiDir).filter(f => f.endsWith('.md')).map(f => f.replace('.md', ''))
    : []

  console.log(`=== LLM 提示词评审测试 ===`)
  console.log(`raw 文件: ${rawFiles.length} 个`)
  console.log(`已有 wiki: ${existingTitles.length} 个`)
  console.log(`每文件最多 3 轮迭代，目标分数 ≥ 80\n`)

  const allResults = []
  let totalIterations = 0
  let passCount = 0

  for (let fi = 0; fi < rawFiles.length; fi++) {
    const rawName = rawFiles[fi]
    const rawFilePath = path.join(rawDir, rawName)
    const rawContent = fs.readFileSync(rawFilePath, 'utf-8')

    console.log(`[${fi + 1}/${rawFiles.length}] ${rawName}`)
    console.log(`  原始大小: ${rawContent.length} 字符`)

    const maxIterations = 3
    const targetScore = 80
    let lastOutput = ''
    let bestScore = 0

    for (let i = 0; i < maxIterations; i++) {
      let compileOutput

      if (i === 0) {
        process.stdout.write(`  第 ${i + 1} 轮: 使用新 prompt 编译... `)
        compileOutput = await compileNewPages(rawContent, rawName, existingTitles, kbPath)
      } else {
        process.stdout.write(`  第 ${i + 1} 轮: 根据评审意见修复... `)
        const issues = validateMultiPage(lastOutput)
        const errorList = issues.reports
          .flatMap(r => r.issues)
          .map(iss => `[${iss.severity}] ${iss.rule}: ${iss.message}`)
          .join('\n')

        const schema = loadSchemaPrompt(kbPath)
        const { chat } = require('./electron/llm-service')
        compileOutput = await chat([
          { role: 'system', content: schema },
          { role: 'user', content: `你上一轮编译的输出有以下质量问题，请逐一修复后重新输出完整的 Wiki 页面：\n\n${errorList}\n\n上一轮输出：\n${lastOutput}` },
        ])
      }

      lastOutput = compileOutput
      const validation = validateMultiPage(compileOutput)
      const score = validation.overallScore
      bestScore = Math.max(bestScore, score)

      const sections = compileOutput.split(/(?=^# )/m).filter(s => s.trim())
      const pageCount = sections.length > 0 ? sections.length : 1

      const emoji = score >= 80 ? '✅' : score >= 60 ? '⚠️' : '❌'
      console.log(`${emoji} ${score} 分 (${pageCount} 页, ${validation.reports[0]?.failed || 0} 错 ${validation.reports[0]?.warnings || 0} 警)`)
      totalIterations++

      if (validation.overallScore >= targetScore) {
        passCount++
        break
      }

      // Brief delay to avoid rate limiting
      if (i < maxIterations - 1 && validation.overallScore < targetScore) {
        await new Promise(r => setTimeout(r, 500))
      }
    }

    allResults.push({
      rawName,
      rawSize: rawContent.length,
      bestScore,
      pages: lastOutput.split(/(?=^# )/m).filter(s => s.trim()).length,
      iterations: Math.min(maxIterations, bestScore >= 80 ? (allResults.length + 1) : maxIterations),
    })
  }

  // Final report
  console.log('\n═══════════════════════════════════════════')
  console.log('提示词质量评审 — 总结报告')
  console.log('═══════════════════════════════════════════')

  const avgScore = Math.round(allResults.reduce((s, r) => s + r.bestScore, 0) / allResults.length)
  const avgPages = Math.round(allResults.reduce((s, r) => s + r.pages, 0) / allResults.length)

  console.log(`\n文件数: ${allResults.length} | 总分: ${avgScore}/100 | 平均页数/文件: ${avgPages}`)
  console.log(`达标 ≥80: ${allResults.filter(r => r.bestScore >= 80).length} | 不达标: ${allResults.filter(r => r.bestScore < 60).length}`)
  console.log(`总迭代次数: ${totalIterations}\n`)

  for (const r of allResults) {
    const icon = r.bestScore >= 80 ? '✅' : r.bestScore >= 60 ? '⚠️' : '❌'
    console.log(`  ${icon} ${String(r.bestScore).padStart(3)}  ${r.rawName}  → ${r.pages} 页 (${r.iterations} 轮)`)
  }
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
