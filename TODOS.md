# TODOS

## 代码块渲染约束（P0）

**What:** MarkdownRenderer 集成到 ChatMessage 后，给 code 组件添加 max-height + 水平滚动，防止大型代码块撑开布局。

**Why:** LLM 可能生成 50+ 行的代码块。在 80% 宽度的聊天气泡中，无约束的代码块会破坏布局。

**Pros:** 一行 CSS（max-h-64 overflow-auto）修复。在实现 MarkdownRenderer 集成时顺手做掉。
**Cons:** 无。

**Context:** MarkdownRenderer 的 code 组件当前无高度限制。在 ChatMessage 中使用时需要约束。

**Depends on / blocked by:** 阶段一 MarkdownRenderer 集成。

---

## 混合检索（P2）

**What:** 将 search-indexer.ts 的 FlexSearch 关键词检索接入 qa-service 检索管道，与 LanceDB 向量检索做倒数排名融合（RRF）。

**Why:** 精确术语匹配（人名、地名、代码、API 名）是纯向量语义检索的已知弱项。FlexSearch 全文索引已存在但问答未使用。

**Pros:** 提升精确术语召回率，已有索引接入成本低。
**Cons:** 需要设计融合策略（RRF vs 加权合并），引入额外检索延迟（关键词搜索 ~10ms），需要调参。

**Context:** qa-service.ts 的 semanticQA() 步骤 2 只调用 vdb.search() 做向量检索。search-indexer.ts 的 buildIndex() 和 search() 是独立的 FlexSearch 关键词索引。融合点在步骤 3（Filter & rerank）之后：向量结果 + 关键词结果 → RRF 融合排序 → 取 Top-K。

**Depends on / blocked by:** 无硬依赖，但建议等阶段一上线后收集真实查询日志再确定融合参数。

---

## 查询改写/扩展（P2）

**What:** 在向量检索前对用户问题进行预处理：同义词扩展、关键词提取。可选 HyDE（Hypothetical Document Embeddings）生成假设文档。

**Why:** 当前用户问题直接向量化，无任何预处理，检索命中率依赖原始措辞。

**Pros:** 同义词扩展简单且无副作用，是检索质量提升的标准实践。
**Cons:** HyDE 引入额外 LLM 调用，增加延迟和成本，需要在实际数据集上验证收益后才能决定是否引入。

**Context:** qa-service.ts 步骤 1（Preprocess）只做 embedQuery(question)。改写应在嵌入之前插入：question → 改写/扩展 → 嵌入生成 → 检索。可以先做简单的关键词提取（jieba/内置分词）和同义词词典，HyDE 作为后续实验。

**Depends on / blocked by:** 无硬依赖。

---

## 内容审查 QA 版（P3）

**What:** 复用 compile-service.ts 的 reviewContent() 模式，对 QA 生成答案做二次 LLM 校验：检查事实是否在来源中、是否有编造、引用格式是否正确。

**Why:** 编译流程已有 reviewContent() 做质量检查，问答流程没有对应的答案校验，LLM 幻觉直接呈现给用户。

**Pros:** reviewContent() 模式已在编译流程中验证有效，可参考其提示模板和重试逻辑。
**Cons:** 每轮问答增加一次额外 LLM 调用，费用和延迟翻倍。低风险场景（闲聊、简单查询）审查无意义，需要区分何时触发。

**Context:** compile-service.ts:215-256 的 reviewContent() 调用 LLM 审查编译输出，检查事实准确性、完整性、逻辑连贯性等。QA 版可参考此模式但需要自定义审查标准（侧重溯源验证而非格式合规）。输出可标记为"置信度：高/中/低"在前端显示。

**Depends on / blocked by:** 阶段一的反馈持久化和多轮对话上线。需要收集用户反馈数据来校准审查阈值。
