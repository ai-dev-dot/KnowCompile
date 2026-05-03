/**
 * Shared utilities used across electron/ modules.
 */

/** Strip <think>...</think> reasoning tags from LLM output. */
export function stripThinking(text: string): string {
  return text.replace(/<\s*think\s*>[\s\S]*?<\/\s*think\s*>/gi, '').trim()
}
