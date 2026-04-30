// Sample data for AI 笔记 — AI application development topics
// These are embedded as strings so no external files are needed

export interface SampleFile {
  name: string
  content: string
}

export const SAMPLE_FILES: SampleFile[] = [
  {
    name: 'sample-大模型API选型指南.md',
    content: `# 大模型 API 选型指南

## 概述

在 AI 应用开发中，选择合适的 LLM API 提供商是架构决策的第一步。本文从开发者视角，对比主流 API 的特点和适用场景。

## OpenAI API

### 优势
- 生态最成熟，SDK 覆盖 Python/Node.js/Go 等主流语言
- GPT-4o 在复杂推理和代码生成方面表现优秀
- 文档完善，社区资源丰富
- 响应速度稳定，SLA 有保障

### 劣势
- 价格较高，大规模调用成本显著
- 国内访问需要代理
- 数据隐私需关注（数据默认存储在美国）

## Anthropic Claude API

### 优势
- Claude 系列在长文本理解和安全性方面领先
- 200K token 上下文窗口，适合大文档分析
- Prompt Caching 功能可显著降低重复调用成本
- System Prompt 遵循度高，输出质量稳定

### 劣势
- SDK 生态不如 OpenAI 成熟
- 国内访问同样需要代理
- 流式响应格式与 OpenAI 不兼容

## MiniMax API

### 优势
- 国内访问低延迟，无需代理
- 中文理解和生成能力优秀
- 兼容 OpenAI API 格式，迁移成本低
- 价格有竞争力

### 劣势
- 国际知名度较低，社区资源有限
- 长文本推理能力与 GPT-4o/Claude 有差距
- SDK 支持语言有限

## 选型建议

- **全球化产品**：优先 OpenAI 或 Anthropic
- **国内产品**：优先 MiniMax 或 DeepSeek
- **高安全要求**：优先 Anthropic Claude
- **成本敏感**：使用兼容 OpenAI 接口的国产模型

## 相关概念

- [[提示工程实践]]
- [[RAG 架构设计]]
- [[LLM Wiki 知识管理]]
`,
  },
  {
    name: 'sample-提示工程实践.txt',
    content: `提示工程最佳实践

提示工程（Prompt Engineering）是 LLM 应用开发的核心技能。好的提示可以显著提升输出质量，而不需要微调模型。

一、基本原则

1. 明确角色设定
在 System Prompt 中清楚定义 AI 的角色。例如："你是一个资深的 Python 后端开发工程师，擅长代码审查。"

2. 结构化输出要求
明确指定期望的输出格式。例如："请以 JSON 格式返回结果，包含以下字段：summary（摘要）、tags（标签列表）、confidence（置信度 0-1）。

3. 提供示例（Few-shot）
在提示中给出 1-3 个输入输出示例，帮助模型理解你的期望模式。

4. 分步思考（Chain of Thought）
对于复杂任务，要求模型"逐步思考"或"先分析再回答"，可以显著提升推理质量。

二、常见模式

模式1：角色扮演
"你是一个[角色]，请以这个角色的视角回答以下问题..."

模式2：约束式
"请回答以下问题，限制在 200 字以内，使用中文，避免使用英文缩写。"

模式3：自检式
"请回答以下问题，然后检查你的回答是否满足以下标准：1) 准确性 2) 完整性 3) 简洁性。"

三、调试技巧

1. 从简单提示开始，逐步增加复杂度
2. 记录每次修改后的输出变化
3. 使用温度参数控制创造性（0=确定性，1=创造性）
4. 对于关键任务，多次运行同一提示观察一致性

四、工具使用

现代 LLM 支持 Function Calling / Tool Use。在提示中清晰描述可用工具的功能和参数，可以让模型更准确地选择和使用工具。
`,
  },
  {
    name: 'sample-RAG与LLM-Wiki架构对比.md',
    content: `# RAG 与 LLM Wiki 架构对比

## 什么是 RAG

RAG（检索增强生成）是目前最流行的 LLM 应用架构之一。其核心流程：

1. 将文档切片（chunking）并向量化
2. 存入向量数据库（Pinecone、Weaviate、Chroma 等）
3. 用户提问时，检索相关文档片段
4. 将片段与问题一起发送给 LLM 生成回答

## RAG 的优势

- 可以处理海量文档（数百万级）
- 支持实时更新的数据源
- 答案可溯源到具体文档片段
- 生态成熟，工具链完善

## RAG 的劣势

- 每次查询都需要重新检索，Token 消耗大
- 知识不会积累——即 Karpathy 所说的 "No accumulation"
- 检索质量依赖分块策略和嵌入模型质量
- 跨文档推理能力受限于检索片段数量

## 什么是 LLM Wiki

LLM Wiki 是 Andrej Karpathy 在 2026 年 4 月提出的新范式：

1. 将原始资料放入 raw/ 目录
2. LLM 一次性"编译"生成结构化 Wiki 页面
3. 后续查询直接使用编译后的 Wiki，不再访问原始资料
4. 每次新资料摄入都迭代完善知识库

## LLM Wiki 的优势

- 编译一次，永久复用，Token 消耗降低 95%
- 知识持续积累，越用越有价值
- 人类可读的 Markdown 格式
- 零基础设施——不需要向量数据库

## 如何选择

| 场景 | 推荐方案 |
|------|----------|
| 海量文档快速检索 | RAG |
| 深度知识体系建设 | LLM Wiki |
| 实时数据问答 | RAG |
| 个人学习笔记 | LLM Wiki |
| 企业知识库 | 两者结合 |

## 相关概念

- [[大模型API选型指南]]
- [[提示工程实践]]
`,
  },
]
