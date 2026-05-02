import { pipeline, env } from '@huggingface/transformers'
import type { FeatureExtractionPipeline } from '@huggingface/transformers'

// Block ALL remote access — the model is cached locally.
// Any network timeout would stall the main-process event loop for 20-60 s.
env.allowRemoteModels = false
env.allowLocalModels = true

// Allow overriding the model host via env var (useful for mirrors).
// Must be set at module scope before any pipeline() call.
if (process.env.EMBEDDING_REMOTE_HOST) {
  env.remoteHost = process.env.EMBEDDING_REMOTE_HOST
  console.log(`[embedding] using remote host: ${env.remoteHost}`)
}

/**
 * EmbeddingService — semantic vector engine powered by bge-m3.
 *
 * Uses @huggingface/transformers to run BGE-M3 ONNX locally.
 * The model is auto-downloaded (~1-2 min on first run) and cached
 * by transformers.js in its default location.
 *
 * Set EMBEDDING_REMOTE_HOST env var to use a mirror (e.g. https://hf-mirror.com).
 * Set EMBEDDING_DTYPE env var to change quantization (fp32, fp16, int8, q4, q4f16, etc.).
 * Default dtype is int8 for smaller download (~568 MB vs 2.27 GB fp32).
 */
export class EmbeddingService {
  private extractor: FeatureExtractionPipeline | null = null
  private dimension: number = 0

  /**
   * Load the bge-m3 ONNX model via transformers.js.
   * Auto-downloads from HuggingFace on first invocation.
   *
   * Uses the ONNX quantized version by default (int8) for reasonable download size.
   * Override with EMBEDDING_DTYPE=fp32 for full-precision embeddings.
   */
  async initialize(): Promise<void> {
    const dtype = (process.env.EMBEDDING_DTYPE || 'int8') as
      | 'fp32' | 'fp16' | 'int8' | 'uint8' | 'q4' | 'q4f16' | 'bnb4'

    const extractor = await pipeline(
      'feature-extraction',
      'Xenova/bge-m3',
      {
        dtype,
        progress_callback: (info: any) => {
          const label = info.file ?? ''
          if (info.status === 'downloading' && label) {
            const pct = info.progress != null ? ` ${Math.round(info.progress)}%` : ''
            console.log(`  [embedding] downloading ${label}${pct}`)
          }
        },
      },
    )

    // Determine embedding dimension from a small probe.
    // Only set this.extractor after the probe succeeds, so a failure here
    // does not leave isReady() returning true with dimension uninitialized.
    try {
      const output = await extractor('dimension probe', {
        pooling: 'mean',
        normalize: true,
      })
      const arr = output.tolist()
      this.dimension = Array.isArray(arr[0]) ? (arr[0] as number[]).length : 0
      this.extractor = extractor
    } catch (err) {
      throw new Error(
        `EmbeddingService: dimension probe failed — model loaded but inference error: ${err}`,
      )
    }
  }

  /** Returns true once the model has been loaded. */
  isReady(): boolean {
    return this.extractor !== null
  }

  /**
   * Embed a single query / text chunk into a float32 vector.
   * Returns a number[] of length = getDimension().
   */
  async embedQuery(query: string): Promise<number[]> {
    if (!this.extractor) {
      throw new Error('EmbeddingService not initialized — call initialize() first')
    }
    const output = await this.extractor(query, {
      pooling: 'mean',
      normalize: true,
    })
    const arr = output.tolist()
    // output shape is [1, dim]; arr looks like [[...values]]
    return (arr[0] as number[]) ?? []
  }

  /**
   * Batch-embed multiple texts.
   * Passes the entire array to the pipeline for a single batched forward pass.
   */
  async embedTexts(texts: string[]): Promise<number[][]> {
    if (!this.extractor) {
      throw new Error('EmbeddingService not initialized — call initialize() first')
    }
    const output = await this.extractor(texts, {
      pooling: 'mean',
      normalize: true,
    })
    const arr = output.tolist()
    // output shape is [N, dim]; arr looks like [[...values], [...values], ...]
    return arr.map((v) => v as number[])
  }

  /**
   * Split text into chunks suitable for embedding.
   *
   * Strategy:
   * 1. Split by paragraph boundaries (double-newline).
   * 2. Greedily combine consecutive paragraphs as long as the result
   *    stays within chunkSize characters.
   * 3. If a single paragraph exceeds chunkSize, split it by sentences.
   * 4. If the input has no paragraph breaks, return it as a single chunk
   *    (or split by sentences if it exceeds chunkSize).
   *
   * @param text      Raw text to chunk.
   * @param chunkSize Maximum characters per chunk (default 500).
   * @returns Array of text chunks.
   */
  chunkText(text: string, chunkSize: number = 500): string[] {
    const paragraphs = text.split(/\n\s*\n/)

    // No paragraph breaks — return as-is (or split if too long).
    if (paragraphs.length <= 1) {
      const trimmed = text.trim()
      if (trimmed.length <= chunkSize) {
        return trimmed.length > 0 ? [trimmed] : []
      }
      return this.splitBySentences(trimmed, chunkSize)
    }

    const chunks: string[] = []
    let current = ''

    for (const para of paragraphs) {
      const trimmed = para.trim()
      if (trimmed.length === 0) continue

      // Paragraph too large — flush current and split this one by sentences.
      if (trimmed.length > chunkSize) {
        if (current.length > 0) {
          chunks.push(current)
          current = ''
        }
        chunks.push(...this.splitBySentences(trimmed, chunkSize))
        continue
      }

      // Would adding this paragraph exceed the limit?
      if (current.length > 0 && current.length + 2 + trimmed.length > chunkSize) {
        chunks.push(current)
        current = trimmed
      } else {
        current = current.length > 0 ? current + '\n\n' + trimmed : trimmed
      }
    }

    if (current.length > 0) {
      chunks.push(current)
    }

    return chunks
  }

  /**
   * Split a single long string by sentence boundaries into chunks
   * no larger than chunkSize.
   */
  private splitBySentences(text: string, chunkSize: number): string[] {
    // Split on sentence-ending punctuation followed by whitespace.
    // Handles both Chinese (。！？) and English (.!?) punctuation.
    const sentences = text
      .split(/(?<=[。！？.!?])\s*/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    if (sentences.length <= 1) {
      // If we couldn't split (no punctuation), just return the text as-is.
      return [text.trim()]
    }

    const chunks: string[] = []
    let current = ''

    for (const sentence of sentences) {
      if (sentence.length > chunkSize) {
        // A single sentence is still too long — force-split by chunkSize.
        if (current.length > 0) {
          chunks.push(current)
          current = ''
        }
        // Hard-split the oversized sentence.
        for (let i = 0; i < sentence.length; i += chunkSize) {
          chunks.push(sentence.slice(i, i + chunkSize).trim())
        }
        continue
      }

      if (current.length > 0 && current.length + 1 + sentence.length > chunkSize) {
        chunks.push(current)
        current = sentence
      } else {
        current = current.length > 0 ? current + ' ' + sentence : sentence
      }
    }

    if (current.length > 0) {
      chunks.push(current)
    }

    return chunks
  }

  /** Returns the vector dimension of the loaded model (bge-m3 = 1024). */
  getDimension(): number {
    return this.dimension
  }

  /** Release the ONNX model and free memory. */
  async dispose(): Promise<void> {
    if (this.extractor) {
      await this.extractor.dispose()
      this.extractor = null
    }
  }
}
