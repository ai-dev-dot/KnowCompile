# 架构

## 技术栈

| 层 | 选型 |
|----|------|
| 桌面框架 | Electron |
| 前端 | React 19 + Tailwind CSS + Vite |
| 主进程 | TypeScript + Node.js |
| LLM 接口 | Anthropic SDK / OpenAI SDK（用户配置 Key） |
| 向量数据库 | LanceDB（嵌入式） |
| 元数据 | SQLite（better-sqlite3） |
| Embedding | BAAI/bge-m3（ONNX 量化，本地运行） |
| Markdown | react-markdown + remark-gfm + rehype-highlight + @tailwindcss/typography |
| 图谱 | Cytoscape.js |
| 搜索 | FlexSearch |
| 测试 | Vitest |

**多模型协作**：编译和审查可使用不同 LLM（设置中的 `review_llm` 字段，未配置时默认使用主 LLM）。推荐编译用强模型，审查用廉价模型，在保证质量的同时控制成本。内容审查可通过 `enable_content_review` 开关。

**用户零额外安装**：所有组件打包进 Electron 安装包，包括 embedding 模型和数据库。

---

## 项目结构

```
electron/           # 主进程（Electron main process）
  main.ts           # 入口，窗口管理
  preload.ts        # contextBridge IPC 白名单
  ipc-handlers.ts   # 所有 IPC 处理器注册
  llm-service.ts    # LLM 调用（chat, chatStream, compileNewPages）
  qa-service.ts     # 问答管道（semanticQA, semanticQAStream, buildContext）
  compile-service.ts # 编译管道（incrementalCompile, reviewContent）
  embedding-service.ts # bge-m3 嵌入（ONNX 工作线程）
  vector-db.ts      # LanceDB 封装
  index-db.ts       # SQLite 封装（better-sqlite3）
  llm-logger.ts     # LLM 交互日志
  qa-analytics.ts   # 问答管道指标
  conversation-store.ts # 对话持久化（JSON 文件）
  query-rewriter.ts # 查询改写（同义词 + 关键词）
  settings-store.ts  # 用户设置
  search-indexer.ts  # FlexSearch 全文索引
  compile-validator.ts # 编译输出质量检查
  wiki-normalizer.ts # Wiki 页面规范化
  fs-manager.ts     # 文件系统操作（导入/校验/预览）
  url-fetcher.ts    # URL 抓取 + LLM 正文提取
  utils.ts          # 共享工具（stripThinking, extractThinking）
  gap-store.ts      # 知识缺口持久化
  report-generator.ts # QA 日报生成器
src/                # 渲染进程（React）
  App.tsx           # 根组件，视图路由
  views/
    QAView.tsx      # AI 问答界面
    IngestView.tsx  # 资料摄入界面
    WikiView.tsx    # Wiki 浏览界面
    SettingsView.tsx # 设置界面
    GraphView.tsx   # 知识图谱界面
    SystemView.tsx  # 系统诊断界面
    LogViewer.tsx   # 日志查看界面
  components/
    ChatMessage.tsx    # 聊天气泡（Markdown + 引用 + 反馈）
    ConversationList.tsx # 会话列表侧边栏
    MarkdownRenderer.tsx # Markdown 渲染（react-markdown）
    IconSidebar.tsx    # 导航侧边栏
    PageList.tsx       # 页面列表
    IngestInput.tsx    # 三种摄入模式（拖放/粘贴/URL）
    RawFileList.tsx    # 文件列表 + 批量编译 + 预览
    DropZone.tsx       # 文件拖放区
  hooks/
    useIPC.ts       # IPC 类型化封装
  test-utils/        # 渲染层测试工具
    mock-ipc.ts     # IPC mock 工厂
    render.tsx      # jsdom 渲染入口
    setup.ts        # DOM 匹配器注册
tests/              # 后端测试
  helpers/
    llm-setup.ts    # LLM 测试凭证加载
  compile-prompt-review.ts # 编译提示词质量评审脚本
```

---

## 数据架构

```
你的知识库/
├── raw/                    # 原始资料（LLM 编译的原料）
├── wiki/                   # LLM 编译的知识页面（Markdown，扁平 + 双向链接）
├── schema/                 # AI 行为规则（人类可编辑，控制编译和文风）
├── .index/                 # 索引层（可随时删除重建）
│   ├── pages.db            # SQLite 元数据
│   └── vectors.lancedb/    # LanceDB 向量索引
└── .ai-notes/              # 应用元数据
    ├── conversations/       # 对话历史（JSON 文件，按会话存储）
    ├── llm-logs/            # LLM 交互日志
    └── qa-analytics/        # 问答管道指标
```

**三个文件夹是唯一真相来源。** 所有索引和数据库都完全可以从 raw/、wiki/、schema/ 重建，你的知识永远是人类可读的 Markdown 文件，不被任何格式锁死。

---

## 核心管道

### 一、编译管道（摄入 → Wiki 页面）

```
raw/ 文件 → 分块 → bge-m3 向量化 → LanceDB 语义搜索已有页面
       → LLM 生成 CompilePlan（JSON：更新/新建/冲突）
       → LLM 生成 Wiki 页面（YAML frontmatter + Markdown）
       → 写入 wiki/ + 更新 SQLite + 重建 LanceDB 页面向量
```

1. **向量化** — 读取 raw/ 文件（PDF/MD/TXT），计算 SHA-256 哈希存入元数据，按 500 字符分块，bge-m3 嵌入为 1024 维向量存入 LanceDB（`type='source'`）
2. **语义搜索** — 用样本块向量在 LanceDB 中检索相关已有页面，按页面聚合相似度，取 Top-N 候选
3. **LLM 生成编译计划** — 发送原始摘要 + 候选页面 + schema 规则，生成 JSON CompilePlan（`updates` / `new_pages` / `conflicts` 三个数组）
4. **LLM 生成页面** — 两步 CoT（分析概念关联 → 按模板输出），系统指令含 few-shot 格式示例和硬性规则（见 schema/ 文件），含 `[[双向链接]]`
5. **内容审查** — 独立审查模型检查页面质量（事实准确性、完整性、链接合理性），不合格则回传修改建议给主编译模型重生成（1 次重试）
6. **写入 + 索引** — 按 `# 标题` 分割多页面输出，规范化后写入 `wiki/*.md`，upsert SQLite pages 表，分块重新嵌入存入 LanceDB（`type='page'`）

### 二、问答管道（问题 → 流式答案 + 来源）

```
用户问题 → bge-m3 嵌入 → LanceDB 向量搜索 + FlexSearch 关键词搜索（并行）
        → RRF 融合 + 相似度过滤 + 去重 + 加权排序 → 取 Top-8 构建上下文
        → LLM 流式生成 token → IPC 推送 → 前端增量渲染
        → 返回 {answer, sources[]} + 行内引用链接
```

1. **问题嵌入** — 用户问题通过 bge-m3 转为查询向量
2. **向量检索 + 关键词检索（混合）** — LanceDB 语义搜索前 30 个最相关页面块，同时 FlexSearch 关键词搜索匹配页面标题
3. **过滤与重排序** — L2 距离转余弦相似度，阈值过滤（0.65），每页最多 3 块，标题匹配 ×2.0，7 日内更新 ×1.2，关键词 RRF 融合加分
4. **上下文构建** — 读取页面 `> 来源：` 行，格式化为 `【页面标题】` 块，控制 token 预算
5. **流式 LLM 生成** — LLM 流式输出 token，通过 Electron IPC 推送到前端，requestAnimationFrame 批量渲染，支持中途停止
6. **多轮对话** — 自动维护对话历史（JSON 文件存储），最近 N 轮上下文传入 LLM，支持会话管理（新建/切换/删除）
7. **反馈系统** — 用户可对回答打分（有帮助/不准确/需更详细），反馈持久化到对话记录和 LLM 日志
8. **行内引用** — Markdown 渲染回答正文，来源列表链接到答案底部，点击可定位

### 三、索引重建（磁盘 → 索引）

```
wiki/*.md + raw/* → 清空 SQLite + LanceDB
                  → 仅 wiki 页面嵌入（raw 文件只注册元数据）
                  → 扫描 [[链接]] → 写入 links 表
```

完全从规范数据（`wiki/` 和 `raw/` 目录下的文件）重建所有索引。确定性操作——可随时执行，不丢失知识。当 wiki/ 为空时跳过嵌入模型加载，秒完成。

raw/ 文件只注册 SQLite 元数据，不做向量嵌入。编译时的语义搜索仅查询 page 块，raw 块的嵌入从未被使用。

### 四、浏览 / 搜索 / 图谱

- **Wiki 浏览** — 解析 `[[双向链接]]`，反向链接和引用页面显示在文章底部，去中心化页面导航
- **全文搜索** — FlexSearch 全文索引，构建时扫描全部 wiki 页面
- **知识图谱** — Cytoscape.js 渲染页面关联网络，节点大小按链接数缩放，CoSE 有机布局

可选开启内容审查（`qa_review_enabled`）——二次 LLM 校验答案是否符合来源，发现问题时附带审查反馈。

所有管道参数（分块大小、相似度阈值、候选数量等）均可通过高级设置调整。

---

## IPC 通道

主进程与渲染进程通过 Electron IPC 通信，所有通道在 `electron/preload.ts` 白名单中注册。

### invoke 通道（渲染进程 → 主进程 → 返回）

`kb:*`, `wiki:*`, `raw:*`, `schema:*`, `settings:*`, `llm:*`, `compile:*`, `conflicts:*`, `index:*`, `diagnostics:*`, `search:*`, `graph:*`, `export:*`, `samples:*`, `conv:*`, `qa:*`, `llm-logs:*`, `qa-analytics:*`

### on 通道（主进程 → 渲染进程推送）

`preload:progress`, `rebuild:progress`, `compile:progress`, `qa:token`, `qa:token-end`

### 流式问答专用通道

```
qa:ask-stream  (invoke)  → 启动流式问答，传入 requestId + convId
qa:token       (on)      → 每个 token 推送 {requestId, token, accumulated}
qa:token-end   (on)      → 流完成 {requestId, sources, error?, partial?}
qa:feedback    (invoke)  → 提交反馈 {convId, msgIndex, type}
conv:*         (invoke)  → 会话 CRUD
```
