/**
 * Wiki page content normalizer.
 *
 * LLM output is non-deterministic — even with the best prompt engineering,
 * models sometimes produce malformed output (extra frontmatter, code fences,
 * think tags, etc.). This module provides a normalization layer that runs
 * BEFORE content is persisted to disk, ensuring that whatever the LLM
 * generates, the stored .md file is always clean.
 *
 * Best practice: never trust LLM output directly. Always validate and
 * normalize before persisting.
 */

/**
 * Normalize a wiki page before writing to disk.
 * All transformations are idempotent — safe to call multiple times.
 */
export function normalizeWikiPage(content: string): string {
  let out = content

  // 1. Strip <think>...</think> reasoning tags (some models leak these)
  out = out.replace(/<think>[\s\S]*?<\/think>/gi, '')

  // 2. Strip ``` fenced code block wrapping (LLMs sometimes wrap the whole page)
  out = out.replace(/^```(?:markdown|md|yaml)?\s*\n/i, '')
  out = out.replace(/\n```\s*$/i, '')

  // 3. Extract the FIRST YAML frontmatter block (at the very start)
  const trimmed = out.trimStart()
  let frontmatterBlock = ''
  let bodyStart = 0

  if (trimmed.startsWith('---')) {
    const afterOpen = trimmed.slice(3)
    const closeIdx = afterOpen.indexOf('\n---\n')
    if (closeIdx >= 0 && /^\w+:[\s\S]/m.test(afterOpen.slice(0, closeIdx))) {
      frontmatterBlock = '---\n' + afterOpen.slice(0, closeIdx) + '\n---'
      bodyStart = 3 + closeIdx + 5 // skip "---\n" + fm + "\n---\n"
    }
  }

  if (!frontmatterBlock) {
    // No valid frontmatter — just trim and return
    return out.trim()
  }

  let body = trimmed.slice(bodyStart).trim()

  // 4. Remove any trailing YAML-like blocks (duplicate frontmatter leaked to the end)
  //    Pattern: one or more "\n---\n" at the end followed by YAML key: value lines
  body = body.replace(/\n---\n(?:type|tags|sources|updated|created|title):[\s\S]*$/m, '')

  // 5. Remove any trailing standalone "---" that was a leftover divider
  body = body.replace(/\n---\s*$/, '')

  // 6. Collapse excessive blank lines (more than 2 consecutive)
  body = body.replace(/\n{3,}/g, '\n\n')

  return frontmatterBlock + '\n\n' + body.trim() + '\n'
}
