/**
 * Query Rewriter — simple synonym expansion and keyword extraction.
 *
 * No LLM calls. No HyDE. Just a synonym dictionary and basic tokenization.
 * Designed to improve retrieval recall for Chinese tech terminology without
 * adding latency or cost to the QA pipeline.
 */

// ---------------------------------------------------------------------------
// Synonym dictionary — focused on AI/ML/tech terminology
// ---------------------------------------------------------------------------

const SYNONYMS: Record<string, string[]> = {
  '机器学习': ['ML', 'machine learning'],
  '深度学习': ['DL', 'deep learning', '深度神经网络'],
  '自然语言处理': ['NLP', '自然语言理解', '文本分析'],
  '计算机视觉': ['CV', '图像识别', '视觉识别'],
  '强化学习': ['RL', 'reinforcement learning'],
  '监督学习': ['supervised learning', '有监督学习'],
  '无监督学习': ['unsupervised learning', '无监督'],
  '神经网络': ['neural network', 'NN', '人工神经网络'],
  '卷积': ['CNN', 'convolution', '卷积运算'],
  '循环神经网络': ['RNN', 'recurrent'],
  'Transformer': ['transformer', '自注意力', 'attention'],
  '大语言模型': ['LLM', '大型语言模型', '大模型'],
  '嵌入': ['embedding', '向量化', '向量表示'],
  '向量': ['vector', 'embedding', '向量的'],
  '检索': ['search', 'retrieval', '查询', '召回'],
  '生成': ['generation', 'generate', '生成式'],
  '推理': ['inference', 'reasoning', '推断'],
  '训练': ['training', 'train', '微调', 'fine-tuning'],
  '模型': ['model', '模式'],
  '数据': ['data', '数据集', '资料'],
  '特征': ['feature', '特性', '属性'],
  '分类': ['classification', 'classify', '归类'],
  '聚类': ['clustering', 'cluster', '分群'],
  '回归': ['regression', '预测'],
  '优化': ['optimization', 'optimize', '最优'],
  '损失函数': ['loss function', 'loss', '代价函数'],
  '梯度': ['gradient', '斜率'],
  '反向传播': ['backprop', 'backpropagation', 'BP'],
  '过拟合': ['overfitting', '过配'],
  '正则化': ['regularization', '正则'],
  '激活函数': ['activation', 'activation function'],
  'ReLU': ['relu', '整流线性单元'],
  '注意力机制': ['attention mechanism', '注意力'],
  '残差': ['residual', '残差连接'],
  '归一化': ['normalization', '标准化', 'normalize'],
  '批量': ['batch', '批次'],
  '迁移学习': ['transfer learning', '迁移'],
  '知识图谱': ['knowledge graph', '知识网络'],
  '分词': ['tokenization', 'tokenize', '切词'],
  '语义': ['semantic', '语义的', '含义'],
  '架构': ['architecture', '结构', '框架'],
  '管道': ['pipeline', '流水线', '流程'],
  '推理引擎': ['inference engine', '推理器'],
  '量化': ['quantization', 'quantize', '压缩'],
  '微服务': ['microservice', '微服务架构'],
  'API': ['api', '接口', '应用程序接口'],
  '数据库': ['database', 'DB', '数据存储'],
  '索引': ['index', '索引结构'],
  '缓存': ['cache', '缓存机制'],
  '并发': ['concurrency', '并行', '多线程'],
}

// ---------------------------------------------------------------------------
// Stop words — common Chinese/English words that carry little meaning
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  '的', '是', '在', '和', '了', '有', '不', '我', '要', '可以',
  '什么', '怎么', '如何', '哪些', '哪个', '为什么', '吗', '呢', '吧',
  '这个', '那个', '这些', '那些', '一个', '一种', '一下',
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
  'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'from',
  'and', 'or', 'but', 'not', 'this', 'that', 'it', 'its',
  'what', 'which', 'who', 'how', 'why', 'when', 'where',
  '请', '帮', '告诉', '解释', '说明', '描述', '列出', '给出',
])

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RewriteResult {
  /** Original question, unchanged. */
  original: string
  /** Expanded question for embedding: original + appended synonym phrases. */
  expanded: string
  /** Extracted keywords for keyword search augmentation. */
  keywords: string[]
}

export function rewriteQuery(question: string): RewriteResult {
  const synonymPhrases: string[] = []
  const foundKeywords: string[] = []

  // Walk the synonym dictionary, collect matches
  for (const [term, synonyms] of Object.entries(SYNONYMS)) {
    const termLower = term.toLowerCase()
    const qLower = question.toLowerCase()
    if (qLower.includes(termLower)) {
      foundKeywords.push(term)
      // Add synonyms that aren't already in the question
      for (const syn of synonyms) {
        if (!qLower.includes(syn.toLowerCase())) {
          synonymPhrases.push(syn)
        }
      }
    }
    // Also check if any synonym appears in the question
    for (const syn of synonyms) {
      if (qLower.includes(syn.toLowerCase()) && !foundKeywords.includes(term)) {
        foundKeywords.push(term)
        if (!qLower.includes(termLower)) {
          synonymPhrases.push(term)
        }
        break
      }
    }
  }

  // Extract additional keywords by basic tokenization
  const extraKeywords = extractKeywords(question)
  for (const kw of extraKeywords) {
    if (!foundKeywords.some(k => k.toLowerCase() === kw.toLowerCase())) {
      foundKeywords.push(kw)
    }
  }

  const expanded = synonymPhrases.length > 0
    ? `${question} (${synonymPhrases.join('; ')})`
    : question

  return { original: question, expanded, keywords: foundKeywords }
}

// ---------------------------------------------------------------------------
// Internal: simple keyword extraction
// ---------------------------------------------------------------------------

function extractKeywords(text: string): string[] {
  const words: string[] = []

  // Split on common delimiters and punctuation
  const segments = text.split(/[\s,，。.!！?？、：:；;（）()【】\[\]""''""'']+/)

  for (const seg of segments) {
    const trimmed = seg.trim()
    if (!trimmed) continue

    // Skip stop words and short fragments
    if (STOP_WORDS.has(trimmed.toLowerCase())) continue
    if (trimmed.length < 2) continue

    // Skip pure numbers and pure punctuation
    if (/^[\d.]+$/.test(trimmed)) continue

    // Accept: Chinese (2+ chars), English words (2+ chars), mixed
    words.push(trimmed)
  }

  // Deduplicate case-insensitively, preserving first occurrence case
  const seen = new Set<string>()
  const result: string[] = []
  for (const w of words) {
    const key = w.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      result.push(w)
    }
  }

  return result
}
