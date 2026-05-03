# Changelog

## v0.1.0 (2026-05-03)

流式问答 + 多轮对话 + 反馈系统 + 行内引用。

### 新增

- **流式回答** — LLM token 逐字推送到前端，不再等待完整生成。支持中途停止，断网保留部分答案并提示重试。
- **多轮对话** — 自动维护对话历史，最近 N 轮上下文传入 LLM。支持会话管理：新建、切换、删除。
- **反馈系统** — 对回答打分（有帮助/不准确/需更详细），反馈持久化到对话记录和 LLM 日志。
- **行内引用** — 答案正文通过 Markdown 渲染，来源列表链接到答案底部。
- **ConversationList 侧边栏** — 会话列表、时间戳、切换/删除操作。
- **preload 安全加固** — `on()` 方法增加白名单检查，与 `invoke()` 一致。
- `stripThinking()` 提取到共享 `electron/utils.ts`，消除 4 处重复。
- `chat()` 重构为 `runLLM()` + `chatStream()`，统一 Anthropic/OpenAI 流式路径。
- `semanticQA()` 提取 `buildContext()`，新增 `semanticQAStream()`。

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
