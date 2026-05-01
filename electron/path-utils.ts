/**
 * Path safety utility — prevents path traversal attacks from the renderer.
 *
 * All file operations from IPC handlers MUST validate that resolved paths
 * are within the knowledge base directory before reading or writing.
 */
import path from 'path'

/**
 * Resolve a user-provided path against the KB root and verify it stays
 * within the KB directory. Throws if the path attempts traversal.
 */
export function resolveSafePath(kbPath: string, subpath: string): string {
  const kbRoot = path.resolve(kbPath)
  const resolved = path.resolve(kbRoot, subpath)

  // Normalize to ensure consistent separators for prefix check
  const normalizedRoot = kbRoot.endsWith(path.sep) ? kbRoot : kbRoot + path.sep
  const normalizedResolved = resolved.endsWith(path.sep) ? resolved : resolved + path.sep

  if (!normalizedResolved.startsWith(normalizedRoot)) {
    throw new Error(`Path traversal blocked: "${subpath}" is outside the knowledge base`)
  }

  return resolved
}
