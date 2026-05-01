/**
 * VectorDB — LanceDB vector database service for chunk storage and semantic search.
 *
 * Stores text chunk embeddings at `<kbPath>/.index/vectors.lancedb/`.
 * Used by both incremental compilation (to retrieve related context) and
 * Q&A (to find the most relevant chunks for a user query).
 *
 * Vector dimension: 1024 (bge-m3).
 */
import { connect } from '@lancedb/lancedb'
import type { Connection, Table } from '@lancedb/lancedb'
import fs from 'fs'
import path from 'path'

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface ChunkInput {
  vector: number[]
  type: 'page' | 'source'
  ref_id: number
  chunk_index: number
  text: string
}

export interface SearchResult {
  vector: number[]
  type: string
  ref_id: number
  chunk_index: number
  text: string
  _distance: number
}

export interface SearchOptions {
  type?: 'page' | 'source'
  topK?: number  // default 30
}

// ---------------------------------------------------------------------------
// VectorDB
// ---------------------------------------------------------------------------

export class VectorDB {
  private readonly dbPath: string
  private conn: Connection | null = null
  private table: Table | null = null

  /**
   * @param kbPath  Absolute path to the knowledge base root.
   */
  constructor(kbPath: string) {
    this.dbPath = path.join(path.resolve(kbPath), '.index', 'vectors.lancedb')
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Connect to LanceDB and open/create the `chunks` table.
   *
   * If the table does not exist yet, it is created with a placeholder row
   * (LanceDB requires at least one row to infer the schema), then the
   * placeholder is deleted.
   */
  async initialize(): Promise<void> {
    fs.mkdirSync(this.dbPath, { recursive: true })

    this.conn = await connect(this.dbPath)

    try {
      // Open existing table.
      this.table = await this.conn.openTable('chunks')
    } catch {
      // Table does not exist — create it with a placeholder row so
      // LanceDB can infer the schema, then remove the placeholder.
      this.table = await this.conn.createTable('chunks', [
        {
          vector: new Array(1024).fill(0),
          type: 'page',
          ref_id: 0,
          chunk_index: 0,
          text: '__placeholder__',
          created_at: new Date().toISOString(),
        },
      ])
      await this.table.delete("ref_id = 0 AND type = 'page' AND text = '__placeholder__'")
    }
  }

  // -------------------------------------------------------------------------
  // Write
  // -------------------------------------------------------------------------

  /**
   * Add one or more chunk embeddings to the table.
   * No-op if the input array is empty.
   */
  async addChunks(chunks: ChunkInput[]): Promise<void> {
    if (!this.table) {
      throw new Error('VectorDB not initialized — call initialize() first')
    }
    if (chunks.length === 0) return

    const timestamp = new Date().toISOString()
    const rows = chunks.map((c) => ({
      vector: c.vector,
      type: c.type,
      ref_id: c.ref_id,
      chunk_index: c.chunk_index,
      text: c.text,
      created_at: timestamp,
    }))

    await this.table.add(rows)
  }

  // -------------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------------

  /**
   * Semantic similarity search.
   *
   * @param queryVector  The 1024-dim query embedding.
   * @param options.type  Optional filter: only return chunks of this type.
   * @param options.topK  Maximum number of results (default 30).
   * @returns Results sorted by ascending distance (closest first).
   */
  async search(
    queryVector: number[],
    options?: SearchOptions,
  ): Promise<SearchResult[]> {
    if (!this.table) {
      throw new Error('VectorDB not initialized — call initialize() first')
    }

    const topK = options?.topK ?? 30

    const builder = this.table.search(queryVector).limit(topK)

    if (options?.type) {
      builder.where(`type = '${options.type}'`)
    }

    const results = await builder.toArray()
    return results as SearchResult[]
  }

  // -------------------------------------------------------------------------
  // Delete
  // -------------------------------------------------------------------------

  /**
   * Delete all chunks belonging to a given record.
   *
   * @param refId  The `id` of the page or source in IndexDB.
   * @param type   `'page'` or `'source'`.
   */
  async deleteChunks(refId: number, type: 'page' | 'source'): Promise<void> {
    if (!this.table) {
      throw new Error('VectorDB not initialized — call initialize() first')
    }
    await this.table.delete(`ref_id = ${refId} AND type = '${type}'`)
  }

  /** Drop the entire chunks table and recreate it (empty). */
  async deleteAllChunks(): Promise<void> {
    if (!this.conn || !this.table) {
      throw new Error('VectorDB not initialized — call initialize() first')
    }

    // Close the current table before dropping.
    try { await this.table.close() } catch { /* ignore — may not exist in all LanceDB versions */ }

    await this.conn.dropTable('chunks')

    // Recreate with placeholder, then delete placeholder.
    this.table = await this.conn.createTable('chunks', [
      {
        vector: new Array(1024).fill(0),
        type: 'page',
        ref_id: 0,
        chunk_index: 0,
        text: '__placeholder__',
        created_at: new Date().toISOString(),
      },
    ])
    await this.table.delete("ref_id = 0 AND type = 'page' AND text = '__placeholder__'")
  }

  // -------------------------------------------------------------------------
  // Utility
  // -------------------------------------------------------------------------

  /** Return the number of rows currently stored. */
  async count(): Promise<number> {
    if (!this.table) {
      throw new Error('VectorDB not initialized — call initialize() first')
    }
    try {
      return await this.table.countRows()
    } catch {
      return 0
    }
  }

  /**
   * Close the table and connection, releasing underlying resources.
   * Safe to call multiple times.
   */
  async close(): Promise<void> {
    if (this.table) {
      try { await this.table.close() } catch { /* ignore */ }
      this.table = null
    }
    if (this.conn) {
      try { await this.conn.close() } catch { /* ignore */ }
      this.conn = null
    }
  }
}
