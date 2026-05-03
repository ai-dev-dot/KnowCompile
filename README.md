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
| LLM 编译 | ✅ | 5 步增量编译管道 + 内容审查，实时进度反馈 |
| Wiki 浏览 | ✅ | Markdown 渲染 + `[[双向链接]]`，反向链接显示在文章底部 |
| AI 问答 | ✅ | 混合检索 + 流式回答 + 多轮对话 + 行内引用 + 反馈系统 |
| 全文搜索 | ✅ | FlexSearch 全文搜索 |
| 知识图谱 | ✅ | Cytoscape.js 可视化页面关联网络 |
| 系统诊断 | ✅ | SQLite / LanceDB / Embedding / 存储概况仪表盘 |
| 导出备份 | ✅ | HTML / Markdown / ZIP 导出 |
| Schema 版本管理 | ✅ | 规则文件升级检测与提示 |
| 问答归档 | ✅ | 优质问答保存到 Wiki/synthesis/，形成知识闭环 |

---

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 运行测试
npm test
```

首次启动进入引导页，配置 LLM API Key。支持 Anthropic（Claude）、OpenAI（GPT-4o）、兼容 OpenAI 接口的模型（DeepSeek、MiniMax、Qwen 等）。Embedding 使用本地 bge-m3 模型，无需额外配置。

---

## 迭代路线

当前版本：**v0.2.1**（见 [CHANGELOG](./CHANGELOG.md)）

| 版本 | 内容 |
|------|------|
| v0.1.0 ✅ | 流式问答 + 多轮对话 + 反馈 + 行内引用 + 混合检索 + 查询改写 + thinking 展示 + 查询建议 + 内容审查 |
| v0.2.0 ✅ | 知识缺口检测 + 智能归档建议 + 知识生长面板 + 反馈驱动检索 |
| v0.2.1 ✅ | 统一日志 + Session ID + 成本追踪 + 错误分类 + QA 分析面板 + Markdown 日报 |
| v0.3.0 | 定期全局重构、知识库健康检查 |

---

## 文档

- [CHANGELOG](./CHANGELOG.md) — 版本变更记录
- [ARCHITECTURE](./ARCHITECTURE.md) — 架构、数据流、管道详解
- [CONTRIBUTING](./CONTRIBUTING.md) — 开发环境、测试、提交规范

## 参考

- [Karpathy LLM Wiki 原始构想](https://github.com/nashsu/llm_wiki)
- [nvk/llm-wiki](https://github.com/nvk/llm-wiki)
- [BAAI/bge-m3](https://huggingface.co/BAAI/bge-m3)
