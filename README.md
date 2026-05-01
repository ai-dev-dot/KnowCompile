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
| LLM 编译 | ✅ | 两步 CoT（分析→生成），few-shot 优化，多页面输出 |
| Wiki 浏览 | ✅ | Markdown 渲染、`[[双向链接]]`、反向链接面板 |
| AI 问答 | ✅ | 基于 Wiki 上下文的对话式问答 |
| 全文搜索 | ✅ | FlexSearch 中文分词 |
| 知识图谱 | ✅ | Cytoscape.js 可视化页面关联网络 |
| 导出备份 | ✅ | HTML / Markdown / ZIP 导出 |
| Schema 版本管理 | ✅ | 规则文件升级检测与提示 |
| 语义检索 | 🚧 v1.0 | bge-m3 本地 embedding + LanceDB 向量搜索 |
| 增量编译 | 🚧 v1.0 | 新资料只更新相关页面，非全量编译 |
| 矛盾检测 | 🚧 v1.0 | 编译时自动标记新旧信息的不一致 |
| 问答归档 | 🚧 v1.0 | 优质问答保存到 Wiki，形成知识闭环 |

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
| Markdown | react-markdown + remark-gfm + rehype-highlight |
| 图谱 | Cytoscape.js |
| 搜索 | FlexSearch |
| 许可 | MIT |

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
```

**三个文件夹是唯一真相来源。** 所有索引和数据库都完全可以从 raw/、wiki/、schema/ 重建，你的知识永远是人类可读的 Markdown 文件，不被任何格式锁死。

---

## 迭代路线

| 版本 | 内容 |
|------|------|
| MVP ✅ | 摄入、编译、问答、搜索、图谱、导出 |
| v1.0 🚧 | 索引层 + 语义检索 + 增量编译 + 矛盾检测 + 问答归档 |
| v1.1 | 流式回答、查询驱动自动补全、用户偏好学习 |
| v1.2 | 定期全局重构、知识库健康检查 |

---

## 参考

- [Karpathy LLM Wiki 原始构想](https://github.com/nashsu/llm_wiki)
- [nvk/llm-wiki](https://github.com/nvk/llm-wiki)
- [BAAI/bge-m3](https://huggingface.co/BAAI/bge-m3)
