/**
 * Shared schema file loading — used by compile-service, llm-service, and IPC handlers.
 */
import fs from 'fs'
import path from 'path'

const SCHEMA_FILES = ['system.md', 'compile-rules.md', 'style-guide.md', 'links-rules.md']

/** Load all schema markdown files from `<kbPath>/schema/`, concatenated. */
export function loadSchemaPrompt(kbPath: string): string {
  const schemaDir = path.join(kbPath, 'schema')
  const parts: string[] = []
  for (const file of SCHEMA_FILES) {
    const filePath = path.join(schemaDir, file)
    if (fs.existsSync(filePath)) {
      parts.push(fs.readFileSync(filePath, 'utf-8'))
    }
  }
  return parts.join('\n\n')
}
