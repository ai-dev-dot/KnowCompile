# Changelog

## v0.2.1 (2026-05-03)

统一日志和可观测性——评估 AI 问答的每个环节。

### 新增

- **Session ID 串联** — 每次 QA 生成唯一 `qaSessionId`，贯穿 LLM 日志 → QA 管道 → 知识缺口 → 反馈，完整链路可追踪。
- **成本追踪** — LLM 日志新增 `promptTokens`、`responseTokens`、`costEstimate` 字段（估算值，仅供参考）。
- **错误分类** — LLM 日志新增 `errorCategory`：timeout / rate_limit / auth / network / other。
- **反馈权重审计** — QA 分析新增 `feedbackWeightsApplied`，记录哪些来源页面被反馈调整了权重及原因。
- **QA 分析面板** — SystemView 新增"QA 分析"Tab：管道耗时、检索健康、LLM 统计、成本、知识缺口、当前参数。
- **Markdown 日报** — `generateDailyReport()` 生成 QA 日报，可存档到 wiki/reports/。
- **缺口统计** — `getGapStats()` 按主题聚合、每日趋势、已解决/未解决分布。

### 工程

- `report-generator.ts`：QA 日报生成器
- `QAAnalyticsPanel.tsx`：QA 分析面板组件
- 19 个新单元测试（token 估算、成本计算、错误分类）

---

## v0.2.0 (2026-05-03)

知识迭代引擎——知识库在问答中自我生长。

### 新增

- **知识缺口检测** — LLM 无法回答时自动记录问题到知识缺口列表。缺口面板展示未回答的问题，点击可跳转摄入。
- **智能归档建议** — LLM 判断回答是否包含有价值的综合/对比/新洞察，自动建议归档为 Wiki 页面。
- **知识生长面板** — 实时显示本次会话的归档数、缺口数、反馈数，让知识积累可视化。
- **反馈驱动检索** — 被多次标记"有帮助"的来源页面自动提升检索权重（×1.3），被标记"不准确"的降低（×0.7）。

### 工程

- `gap-store.ts`：知识缺口 JSONL 持久化
- `checkArchiveWorthy()`：轻量 LLM 归档判断（预过滤 + 解析）
- `isArchiveCandidate()` / `parseArchiveVerdict()` / `parseReviewVerdict()`：可测试的纯函数
- 24 个新单元测试（gap-store 10 + archive/review 14）

---

## v0.1.0 (2026-05-03)

AI 问答模块全面升级：从单轮等待变成流式多轮对话，检索质量大幅提升，交互细节补齐。

### 核心体验（P0）

- **流式回答** — LLM token 逐字推送到前端，不再等待完整生成。支持中途停止，断网保留部分答案并提示重试。
- **多轮对话** — 自动维护对话历史，最近 N 轮上下文传入 LLM。支持会话管理：新建、切换、删除。
- **反馈系统** — 对回答打分（有帮助/不准确/需更详细），反馈持久化到对话记录和 LLM 日志。

### 交互增强（P1）

- **行内引用** — 答案正文通过 Markdown 渲染，来源列表链接到答案底部。
- **ConversationList 侧边栏** — 会话列表、时间戳、切换/删除操作。

### 检索增强（P2）

- **混合检索** — FlexSearch 关键词 + LanceDB 向量 RRF 融合，精确术语匹配不再遗漏。
- **查询改写** — 60+ 中文 AI 术语同义词词典，查询扩展后嵌入，关键词提取辅助关键词搜索。

### 交互细节（P3）

- **推理过程展示** — `<think>` 标签内容保留并在可折叠面板中显示（支持 DeepSeek 等 reasoning 模型）。
- **查询建议** — LLM 在回答末尾生成 3 个后续问题，点击直接填入输入框。
- **内容审查（可选）** — `qa_review_enabled` 开启后二次 LLM 校验答案是否基于来源，默认关闭。

### 工程改进

- **preload 安全加固** — `on()` 方法增加白名单检查，与 `invoke()` 一致。
- `stripThinking()` 提取到共享 `electron/utils.ts`，消除 4 处重复。
- `chat()` 重构为 `runLLM()` + `chatStream()`，统一 Anthropic/OpenAI 流式路径。
- `semanticQA()` 提取 `buildContext()`，新增 `semanticQAStream()`。
- 文档体系建立：ARCHITECTURE.md、CHANGELOG.md、CONTRIBUTING.md、VERSION。

### 修复

- 流式竞态条件：每个请求带唯一 correlation ID，切换会话/卸载时 AbortController 取消。
- 流式渲染性能：requestAnimationFrame 批量更新，避免每秒 60+ 次 setState。

---

## 此前版本

### MVP

- 资料摄入（拖放 PDF/Markdown/纯文本）
- LLM 编译（两步 CoT 生成 Wiki 页面）
- AI 问答（7 步语义检索管道）
- 全文搜索（FlexSearch）
- 知识图谱（Cytoscape.js）
- 导出备份（HTML/Markdown/ZIP）

### v1.0

- 索引层（SQLite + LanceDB）
- 语义检索（bge-m3 本地 embedding）
- 增量编译（5 步管道 + 内容审查 + 矛盾检测）
- 问答归档
- 系统诊断仪表盘
- Schema 版本管理
