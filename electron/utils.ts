/**
 * Shared utilities used across electron/ modules.
 */

/** Strip <think>...</think> reasoning tags from LLM output. */
export function stripThinking(text: string): string {
  return text.replace(/<\s*think\s*>[\s\S]*?<\/\s*think\s*>/gi, '').trim()
}

/** Extract <think>...</think> content for display. Returns concatenated think blocks. */
export function extractThinking(text: string): string {
  const matches = text.match(/<\s*think\s*>([\s\S]*?)<\/\s*think\s*>/gi)
  if (!matches) return ''
  return matches
    .map(m => m.replace(/<\s*think\s*>/gi, '').replace(/<\/\s*think\s*>/gi, ''))
    .join('\n')
    .trim()
}
