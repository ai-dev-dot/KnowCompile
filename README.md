# 知译 KnowCompile

**知识的编译器——把原始资料编译成你的第二大脑。**

基于 Andrej Karpathy 2026 年 4 月提出的 [LLM Wiki 范式](https://github.com/nashsu/llm_wiki)，将 PDF、Markdown、纯文本等原始资料"编译"为结构化 Wiki 页面，实现知识的持续积累而非反复检索。

> Compile once, reuse forever.

---

## 核心理念

传统 RAG 每次提问都要重新检索所有原始资料，没有任何积累。LLM Wiki 则是**提前将资料编译成结构化知识，一次编译永久复用**。你的知识库会随着使用越变越聪明——这就是 Karpathy 所说的"知识复利"。

与笔记工具（Obsidian、Notion）的区别：不是你手动写笔记，而是 **AI 读你的资料，帮你写和更新**。

---

## 功能

| 功能 | 状态 | 说明 |
|------|------|------|
| 资料摄入 | ✅ | 拖放 PDF/Markdown/纯文本，自动存入 raw/ |
| LLM 编译 | ✅ | 5 步增量编译管道 + 内容审查（独立模型审查 + 不合格重试），实时进度反馈 |
| Wiki 浏览 | ✅ | Markdown 渲染 + 表格/代码高亮，`[[双向链接]]`，反向链接显示在文章底部 |
| AI 问答 | ✅ | 7 步语义检索管道 + 流式回答 + 多轮对话 + 行内引用 + 反馈系统 |
| 全文搜索 | ✅ | FlexSearch 全文搜索 |
| 知识图谱 | ✅ | Cytoscape.js 可视化页面关联网络 |
| 系统诊断 | ✅ | SQLite / LanceDB / Embedding / 存储概况仪表盘 |
| 导出备份 | ✅ | HTML / Markdown / ZIP 导出 |
| Schema 版本管理 | ✅ | 规则文件升级检测与提示 |
| 语义检索 | ✅ | bge-m3 本地 embedding + LanceDB 向量搜索 |
| 增量编译 | ✅ | 新资料语义搜索已有页面，LLM 生成增量 CompilePlan |
| 矛盾检测 | ✅ | 编译时自动标记新旧信息的不一致，支持人工确认解决 |
| 问答归档 | ✅ | 优质问答保存到 Wiki/synthesis/，形成知识闭环 |

---

## 技术栈

| 层 | 选型 |
|----|------|
| 桌面框架 | Electron |
| 前端 | React 18 + Tailwind CSS + Vite |
| 主进程 | TypeScript + Node.js |
| LLM 接口 | Anthropic SDK / OpenAI SDK（用户配置 Key） |
| 向量数据库 | LanceDB（嵌入式） |
| 元数据 | SQLite（better-sqlite3） |
| Embedding | BAAI/bge-m3（ONNX 量化，本地运行） |
| Markdown | react-markdown + remark-gfm + rehype-highlight + @tailwindcss/typography |
| 图谱 | Cytoscape.js |
| 搜索 | FlexSearch |
| 许可 | MIT |

**多模型协作**：编译和审查可使用不同 LLM。推荐编译用强模型，审查用廉价模型，在保证质量的同时控制成本。

**用户零额外安装**：所有组件打包进 Electron 安装包，包括 embedding 模型和数据库。

---

## 快速开始

### 开发环境

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

### LLM 配置

首次启动进入引导页，配置 API Key。支持：
- Anthropic（Claude 系列）
- OpenAI（GPT-4o 等）
- 兼容 OpenAI 接口的模型（DeepSeek、MiniMax、Qwen 等）

LLM 用于编译和问答，本地 bge-m3 用于 embedding，两个独立。

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

## 核心逻辑流

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
4. **LLM 生成页面** — 两步 CoT（分析概念关联 → 按模板输出），严格按 schema 风格生成，含 `[[双向链接]]`
5. **内容审查** — 独立审查模型检查页面质量（事实准确性、完整性、链接合理性），不合格则回传修改建议给主编译模型重生成（1 次重试）
6. **写入 + 索引** — 按 `# 标题` 分割多页面输出，规范化后写入 `wiki/*.md`，upsert SQLite pages 表，分块重新嵌入存入 LanceDB（`type='page'`）

### 二、问答管道（问题 → 流式答案 + 来源）

```
用户问题 → bge-m3 嵌入 → LanceDB 向量搜索 Top-30 块
        → 相似度过滤 + 去重 + 加权排序 → 取 Top-8 构建上下文
        → LLM 流式生成 token → IPC 推送 → 前端增量渲染
        → 返回 {answer, sources[]} + 行内引用链接
```

1. **问题嵌入** — 用户问题通过 bge-m3 转为查询向量
2. **向量检索** — LanceDB 搜索前 30 个最相关页面块
3. **过滤与重排序** — L2 距离转余弦相似度，阈值过滤（0.65），每页最多 3 块，标题匹配 ×2.0，7 日内更新 ×1.2
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

完全从规范数据（`wiki/` 和 `raw/` 目录下的文件）重建所有索引。确定性操作——可随时执行，不丢失知识。**当 wiki/ 为空时跳过嵌入模型加载，秒完成。**

> raw/ 文件只注册 SQLite 元数据，不做向量嵌入。编译时的语义搜索仅查询 page 块，raw 块的嵌入从未被使用。

### 四、浏览 / 搜索 / 图谱

- **Wiki 浏览** — 解析 `[[双向链接]]`，反向链接和引用页面显示在文章底部，去中心化页面导航
- **全文搜索** — FlexSearch 全文索引，构建时扫描全部 wiki 页面
- **知识图谱** — Cytoscape.js 渲染页面关联网络，节点大小按链接数缩放，CoSE 有机布局

> 所有管道参数（分块大小、相似度阈值、候选数量等）均可通过高级设置调整。

---

## 迭代路线

| 版本 | 内容 |
|------|------|
| MVP ✅ | 摄入、编译、问答、搜索、图谱、导出 |
| v1.0 ✅ | 索引层 + 语义检索 + 增量编译 + 矛盾检测 + 问答归档 |
| v1.1 🚧 | 流式回答 ✅、多轮对话 ✅、反馈系统 ✅、行内引用 ✅、混合检索、查询改写、内容审查 |
| v1.2 | 定期全局重构、知识库健康检查 |

---

## 参考

- [Karpathy LLM Wiki 原始构想](https://github.com/nashsu/llm_wiki)
- [nvk/llm-wiki](https://github.com/nvk/llm-wiki)
- [BAAI/bge-m3](https://huggingface.co/BAAI/bge-m3)
