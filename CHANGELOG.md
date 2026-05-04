# Changelog

## v0.3.0 (2026-05-04)

编译质量与资料摄入全面加固——提示词工程化、验证器修复、图片资产支持。

### 编译系统

- **Schema few-shot 示例** — `compile-rules.md` 新增完整格式示例（YAML frontmatter + 多节正文 + 链接章节），`links-rules.md` 新增 4 个正确/错误链接对比示例，`system.md` 重构角色定义与行为准则。所有内置 schema 版本升至 v4，已有知识库自动更新。
- **验证器修复** — `validateMultiPage` 前端合并逻辑修复（frontmatter + 页面主体不再被拆散评分），YAML 多行列表解析器重写（`sources:\n  - file.md` 格式正确识别），`type` 字段从 3 个扩展到 7 个允许值。
- **分析阶段注入格式** — `compileNewPages()` 的分析步骤现在也能看到输出格式规范，不只生成步骤。
- **质量评审脚本** — `tests/compile-prompt-review.ts`：用真实 schema + 真实 raw 文件测试编译质量，输出逐页评分和问题汇总。当前 MiniMax-M2.7 平均 88/100。
- **LLM 可观测性** — 每次 LLM 请求在控制台输出模型、prompt 大小、耗时。

### 资料摄入

- **图片资产自动导入** — 导入 Markdown 文件时自动发现并复制引用的本地图片（`![alt](img.png)`、`<img>` 标签等），支持 PNG/JPEG/GIF/WebP/SVG/BMP。
- **Markdown 图片渲染** — Wiki 页面中的本地图片自动通过 `assets:read` 通道以 base64 渲染。
- **image/webp 等图片格式**加入支持的文件类型列表。

### 配置与 UI

- **审查模型独立配置** — 设置中可指定 `review_llm`（模型+Key+Base URL），编译时用独立模型审查内容质量。新增 `enable_content_review` 开关。
- **批量编译 UI** — RawFileList 新增"全部编译"按钮 + 进度条 + 逐文件结果汇总。文件行实时显示当前编译步骤（如"LLM 生成 Wiki 页面"）。
- **一键重置 Wiki** — 高级设置中新增"重置所有 Wiki 页面"按钮，删除所有页面、清空索引和编译日志、重置 raw 文件为待编译状态。
- **wiki:delete** 现在同步清理 SQLite 和 LanceDB 向量。

### 修复

- 批量编译缺少 progress 监听器导致进度条不更新 — 已修复。
- `updateSourceStatus` 在非 compiled 状态下也写入 `last_compiled_at`，导致重置后文件仍被判为已编译 — 改为仅在 status='compiled' 时写入。

### 工程

- `llm-service.ts`：`max_tokens` 4096 → 8192，QA 流式路径中 archive check 改为本地快速判断（消除 5-15s 后置等待）。
- `compile-validator.ts`：`##` 小节要求从 2 个降为 1 个（warn），页长阈值放宽。
- `compile-prompt-review.ts`：新增编译质量评审脚本。
- 测试超时从 30s 调至 60s，LLM 集成测试默认读取 `%APPDATA%/knowcompile/settings.json`。

---

## v0.2.3 (2026-05-04)

资料摄入全面改造——不只是拖文件。

### 新增

- **PDF 文本提取** — 真正的 PDF 支持，自动提取文本内容。损坏或扫描件 PDF 给出明确中文提示。
- **文本粘贴摄入** — 直接粘贴 Markdown/纯文本，系统自动保存为 `.md` 文件。
- **网页链接摄入** — 粘贴 URL，LLM 自动抓取网页正文并转为 Markdown。
- **批量编译** — "全部编译"按钮，一次编译所有未处理的文件，完成后汇总结果。
- **文件内容预览** — 点击文件名展开 raw 文件内容预览，不用离开应用。
- **导入文件校验** — 自动拒绝超大文件（>50MB）、不支持的格式、重复文件。
- **用户友好错误** — 编译失败显示中文提示，不再是 JavaScript 异常。
- **设计打磨** — 去掉重复的 raw/ 侧边栏，Emoji 图标模式 Tab，输入引导文案，编译完成提示"切换到 Wiki 视图查看"。

### 工程

- `electron/url-fetcher.ts`：URL 抓取 + LLM 正文提取
- `electron/fs-manager.ts`：新增 `validateRawFile()`、`readRawContent()`，copyToRaw 错误处理
- `electron/compile-service.ts`：新增 `extractPDFText()`（pdf-parse v2）
- `src/components/IngestInput.tsx`：三种摄入模式（拖放/粘贴/URL）
- `src/components/RawFileList.tsx`：批量编译、预览、中文错误映射
- `src/views/IngestView.tsx`：重构为编排层
- 14 个新测试（fs-manager 9 + IngestInput 5）

---

## v0.2.2 (2026-05-04)

渲染层测试基础设施建设——React 组件测试从 0 到 45 个用例。

### 新增

- **渲染层测试** — 5 个新测试文件，45 个 test case，覆盖纯函数和 React 组件。
- **IPC mock 工厂** — `createMockIPC()` 覆盖 40+ 个 IPC 通道，每个通道默认返回合理值，支持 per-test 定制。
- **jsdom 测试环境** — vitest 双环境（node + jsdom），后端测试和渲染层测试在同一个 `npm test` 中运行。

### 工程

- `src/test-utils/mock-ipc.ts`：IPC mock 工厂
- `src/test-utils/render.tsx`：组件测试渲染入口（自动 stub `window.electronAPI`）
- `src/test-utils/setup.ts`：DOM 匹配器注册
- 导出 `stripLeadingFrontmatter`、`convertWikiLinks` 为可测试的纯函数
- 45 个新测试：`stripThinking`/`extractThinking`（11）、MarkdownRenderer 纯函数（10）、IconSidebar（4）、PageList（6）、ChatMessage（14）

---

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
