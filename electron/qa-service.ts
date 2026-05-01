/**
 * QAService — Semantic question-answering service with 7-step pipeline.
 *
 * Pipeline:
 *   1. Preprocess        — embed the question via EmbeddingService
 *   2. Vector search     — find top-K semantically similar chunks in VectorDB
 *   3. Filter & rerank   — similarity threshold, per-page dedup, weighting
 *   4. Build context     — format chunks with page titles and source lines
 *   5. LLM generate      — call the LLM with schema-backed system prompt
 *   6. Post-process      — assemble answer + annotated source list
 *   7. Return            — QAResult to the caller
 *
 * This is the key user-facing feature of the v1.0 iteration engine.
 */
import { IndexDB } from './index-db'
import { VectorDB } from './vector-db'
import type { SearchResult } from './vector-db'
import { EmbeddingService } from './embedding-service'
import { chat } from './llm-service'
import fs from 'fs'
import path from 'path'

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface QAResult {
  answer: string
  sources: { title: string; chunk_index: number; similarity: number }[]
}

interface WeightedChunk {
  result: SearchResult
  similarity: number
  weight: number
  title: string
  sourceLine: string
}

// ---------------------------------------------------------------------------
// Distance / similarity conversion
// ---------------------------------------------------------------------------

/**
 * Convert LanceDB L2 distance to cosine similarity for normalized vectors.
 *
 * For unit-norm vectors:  cos(θ) = 1 - d²/2
 * where d = ||u-v|| is the Euclidean distance between two normalized vectors.
 */
function distanceToSimilarity(distance: number): number {
  return Math.max(0, 1 - (distance * distance) / 2)
}

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

/** Rough token count estimate: Chinese chars / 2 ≈ tokens. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 2)
}

// ---------------------------------------------------------------------------
// Page file helpers
// ---------------------------------------------------------------------------

/**
 * Read the first line matching `> 来源：...` from a page markdown file.
 * Returns an empty string when the file is missing or no source line is found.
 */
function readSourceLine(pageFilePath: string): string {
  try {
    const content = fs.readFileSync(pageFilePath, 'utf-8')
    for (const line of content.split('\n')) {
      if (line.startsWith('> 来源：')) return line.trim()
    }
  } catch {
    // File missing or unreadable — return empty.
  }
  return ''
}

// ---------------------------------------------------------------------------
// Settings helpers
// ---------------------------------------------------------------------------

function getSettingNum(
  db: IndexDB,
  key: string,
  defaultValue: number,
): number {
  const raw = db.getSetting(key, String(defaultValue))
  const n = Number(raw)
  return Number.isFinite(n) ? n : defaultValue
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

export async function semanticQA(
  question: string,
  kbPath: string,
  embedding: EmbeddingService,
  db: IndexDB,
  vdb: VectorDB,
): Promise<QAResult> {
  // -------------------------------------------------------------------
  // Step 1 — Preprocess: generate question embedding
  // -------------------------------------------------------------------
  const questionVec = await embedding.embedQuery(question)

  // -------------------------------------------------------------------
  // Step 2 — Vector search
  // -------------------------------------------------------------------
  const retrievalCount = getSettingNum(db, 'qa_retrieval_count', 30)
  const rawResults = await vdb.search(questionVec, {
    type: 'page',
    topK: retrievalCount,
  })

  if (rawResults.length === 0) {
    return {
      answer: '知识库中未找到相关内容，无法回答该问题。',
      sources: [],
    }
  }

  // -------------------------------------------------------------------
  // Step 3 — Filter & rerank
  // -------------------------------------------------------------------
  const similarityThreshold = getSettingNum(db, 'qa_similarity_threshold', 0.65) // stored as string like "0.65"
  const finalTopK = getSettingNum(db, 'qa_final_context_count', 8)
  const now = Date.now()

  // 3a. Convert distance → similarity, filter by threshold.
  const withSim: { result: SearchResult; similarity: number }[] = []
  for (const r of rawResults) {
    const sim = distanceToSimilarity(r._distance)
    if (sim >= similarityThreshold) {
      withSim.push({ result: r, similarity: sim })
    }
  }

  // 3b. Keep top 3 chunks per page (dedup by ref_id within the same type).
  const perPage: Map<number, { result: SearchResult; similarity: number }[]> = new Map()
  for (const item of withSim) {
    const key = item.result.ref_id
    const bucket = perPage.get(key) || []
    if (bucket.length < 3) {
      bucket.push(item)
      perPage.set(key, bucket)
    }
  }

  // 3c. Resolve page titles and apply weights.
  const weighted: WeightedChunk[] = []
  for (const [, chunks] of perPage) {
    for (const item of chunks) {
      const page = db.getPageById(item.result.ref_id)
      const title = page?.title ?? `页面#${item.result.ref_id}`

      let weight = item.similarity

      // Title match: if question contains title words, ×2.0
      const titleWords = title.split(/\s+/).filter((w) => w.length > 0)
      if (titleWords.some((w) => question.includes(w))) {
        weight *= 2.0
      }

      // Recent update: within 7 days, ×1.2
      if (page?.updated_at) {
        const updatedMs = Date.parse(page.updated_at)
        if (!Number.isNaN(updatedMs)) {
          const daysAgo = (now - updatedMs) / (1000 * 60 * 60 * 24)
          if (daysAgo <= 7) {
            weight *= 1.2
          }
        }
      }

      // Source line from the page file
      const pageFilePath = page
        ? path.join(kbPath, page.path)
        : ''
      const sourceLine = pageFilePath ? readSourceLine(pageFilePath) : ''

      weighted.push({
        result: item.result,
        similarity: item.similarity,
        weight,
        title,
        sourceLine,
      })
    }
  }

  // 3d. Sort by weight descending, keep top K.
  weighted.sort((a, b) => b.weight - a.weight)
  const topChunks = weighted.slice(0, finalTopK)

  if (topChunks.length === 0) {
    return {
      answer: '知识库中未找到足够相关的内容，无法回答该问题。',
      sources: [],
    }
  }

  // -------------------------------------------------------------------
  // Step 4 — Build context
  // -------------------------------------------------------------------
  const contextMaxTokens = getSettingNum(db, 'qa_context_max_tokens', 3000)
  const contextParts: string[] = []
  let tokenBudget = contextMaxTokens

  for (const chunk of topChunks) {
    let block = `【页面标题：${chunk.title}】\n`
    if (chunk.sourceLine) {
      block += `${chunk.sourceLine}\n`
    }
    block += `${chunk.result.text}\n---`

    const blockTokens = estimateTokens(block)
    if (blockTokens > tokenBudget) {
      // If this is the first chunk and it exceeds budget, include it anyway
      // (truncated) so the LLM has at least some context.
      if (contextParts.length === 0) {
        const allowed = Math.floor(tokenBudget * 2) // chars ≈ tokens × 2
        block = block.slice(0, allowed) + '\n[已截断]'
        contextParts.push(block)
      }
      break
    }

    contextParts.push(block)
    tokenBudget -= blockTokens
  }

  const contextText = contextParts.join('\n\n')

  // -------------------------------------------------------------------
  // Step 5 — LLM generate
  // -------------------------------------------------------------------
  const systemPath = path.join(kbPath, 'schema', 'system.md')
  let schemaContent = ''
  try {
    schemaContent = fs.readFileSync(systemPath, 'utf-8')
  } catch {
    // No system.md — use a minimal fallback.
  }

  const systemPrompt =
    `${schemaContent}\n\n` +
    `你是一个知识库问答助手。你必须**严格基于**下面"参考资料"中的内容回答问题。\n\n` +
    `规则：\n` +
    `1. **禁止编造**：只能使用参考资料中明确出现的信息。如果资料中没有，直接说"资料未提供相关信息"。\n` +
    `2. **引用来源**：回答时注明信息来自哪个页面。使用【来源：页面标题】的格式。\n` +
    `3. **综合回答**：如果多个资料提供不同角度的信息，请综合并指出差异。\n` +
    `4. **简洁清晰**：回答直接切中要点，不绕弯子。\n\n` +
    `---\n\n` +
    `## 参考资料\n\n${contextText}`

  const userMessage = `问题：${question}`

  const response = await chat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ])

  // -------------------------------------------------------------------
  // Step 6 — Post-process: assemble sources list
  // -------------------------------------------------------------------
  const seenSources = new Set<string>()
  const sources: { title: string; chunk_index: number; similarity: number }[] = []

  for (const chunk of topChunks) {
    const key = `${chunk.title}|${chunk.result.chunk_index}`
    if (!seenSources.has(key)) {
      seenSources.add(key)
      sources.push({
        title: chunk.title,
        chunk_index: chunk.result.chunk_index,
        similarity: Math.round(chunk.similarity * 1000) / 1000,
      })
    }
  }

  // -------------------------------------------------------------------
  // Step 7 — Return
  // -------------------------------------------------------------------
  return { answer: response, sources }
}
