/**
 * KB-Init tests — knowledge base initialization and schema management
 * Usage: npx vitest run tests/kb-init.test.ts
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { initKnowledgeBase, checkSchemaUpdate, updateSchema, SCHEMA_VERSION } from '../electron/kb-init'

describe('KB-Init', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knowcompile-kb-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  // -- initKnowledgeBase --
  it('1. creates expected directory structure', () => {
    const result = initKnowledgeBase(tmpDir)
    expect(result.success).toBe(true)

    expect(fs.existsSync(path.join(tmpDir, 'raw'))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, 'wiki'))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, 'schema'))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, '.ai-notes'))).toBe(true)
  })

  it('2. creates schema files with content', () => {
    initKnowledgeBase(tmpDir)

    expect(fs.existsSync(path.join(tmpDir, 'schema', 'system.md'))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, 'schema', 'compile-rules.md'))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, 'schema', 'style-guide.md'))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, 'schema', 'links-rules.md'))).toBe(true)

    // Verify content is non-empty
    const systemContent = fs.readFileSync(path.join(tmpDir, 'schema', 'system.md'), 'utf-8')
    expect(systemContent.length).toBeGreaterThan(0)
    expect(systemContent).toContain('知译 KnowCompile')
  })

  it('3. creates .gitignore with correct entries', () => {
    initKnowledgeBase(tmpDir)

    const gitignore = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf-8')
    expect(gitignore).toContain('.index/')
    expect(gitignore).toContain('.ai-notes/')
  })

  it('4. is idempotent — re-initializing does not overwrite schema files', () => {
    initKnowledgeBase(tmpDir)

    // Modify a schema file
    const systemPath = path.join(tmpDir, 'schema', 'system.md')
    fs.writeFileSync(systemPath, 'Custom content', 'utf-8')

    // Re-initialize
    initKnowledgeBase(tmpDir)

    // Should NOT overwrite existing files
    const content = fs.readFileSync(systemPath, 'utf-8')
    expect(content).toBe('Custom content')
  })

  it('5. writes schema version file', () => {
    initKnowledgeBase(tmpDir)

    const versionPath = path.join(tmpDir, '.ai-notes', 'schema-version')
    expect(fs.existsSync(versionPath)).toBe(true)
    const version = parseInt(fs.readFileSync(versionPath, 'utf-8').trim(), 10)
    expect(version).toBe(SCHEMA_VERSION)
  })

  // -- checkSchemaUpdate --
  it('6. reports update available when no version file exists', () => {
    const result = checkSchemaUpdate(tmpDir)
    expect(result.updateAvailable).toBe(true)
    expect(result.currentVersion).toBe(0)
    expect(result.latestVersion).toBe(SCHEMA_VERSION)
  })

  it('7. reports no update when version matches', () => {
    initKnowledgeBase(tmpDir)
    const result = checkSchemaUpdate(tmpDir)
    expect(result.updateAvailable).toBe(false)
    expect(result.currentVersion).toBe(SCHEMA_VERSION)
  })

  it('8. reports update when version is behind', () => {
    // Write an old version
    fs.mkdirSync(path.join(tmpDir, '.ai-notes'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, '.ai-notes', 'schema-version'), String(SCHEMA_VERSION - 1), 'utf-8')

    const result = checkSchemaUpdate(tmpDir)
    expect(result.updateAvailable).toBe(true)
    expect(result.currentVersion).toBe(SCHEMA_VERSION - 1)
  })

  // -- updateSchema --
  it('9. updates schema files and bumps version', () => {
    // updateSchema expects an initialized KB (needs .ai-notes/ dir)
    initKnowledgeBase(tmpDir)

    const result = updateSchema(tmpDir)
    expect(result.success).toBe(true)
    expect(result.updated).toHaveLength(4)

    const version = parseInt(
      fs.readFileSync(path.join(tmpDir, '.ai-notes', 'schema-version'), 'utf-8').trim(),
      10,
    )
    expect(version).toBe(SCHEMA_VERSION)
  })
})
