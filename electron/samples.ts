// Sample data for AI — AI application development topics
// Three formats: structured Markdown, rough plain-text notes, technical deep-dive

export interface SampleFile {
  name: string
  content: string
}

const cb = '```'

export const SAMPLE_FILES: SampleFile[] = [
  {
    name: 'sample-AI-Agent开发入门.md',
    content: `# AI Agent 开发入门

## 什么是 AI Agent

AI Agent（智能体）是能够自主感知环境、制定计划、调用工具并执行任务的 AI 系统。与传统的"输入-输出"式 LLM 调用不同，Agent 具备**自主决策**和**多步执行**能力。

一个典型的 Agent 架构包含四个核心组件：

1. **推理引擎**（LLM）：负责理解任务、分解步骤、做出决策
2. **工具集**（Tools）：Agent 可以调用的外部能力（搜索、代码执行、API 调用等）
3. **记忆系统**（Memory）：短期记忆（对话上下文）和长期记忆（向量数据库、知识库）
4. **规划器**（Planner）：将复杂任务拆解为可执行的子任务序列

## 主流框架对比

### LangChain

LangChain 是最早的 Agent 框架之一，提供了丰富的链式调用抽象。

**优势：**
- 生态丰富，集成 100+ 工具和模型
- 文档和社区资源最多
- 支持 Python 和 JavaScript

**劣势：**
- 抽象层过多，调试困难
- 性能开销较大
- 版本更新频繁，API 不稳定

### Anthropic Claude Agent SDK

2026 年初发布，专注于 Claude 模型的 Agent 开发。

**优势：**
- 与 Claude 深度集成，Tool Use 体验流畅
- 内置 MCP（Model Context Protocol）支持
- 代码简洁，学习曲线平缓

**劣势：**
- 仅支持 Claude 模型
- 生态较新，社区资源有限

### 自建 Agent

越来越多的开发者选择不依赖框架，直接基于 LLM API 构建 Agent。

**优势：**
- 完全可控，无黑盒问题
- 性能最优，无额外抽象开销
- 可根据业务精确定制

**劣势：**
- 需要从零实现工具调用、记忆管理等
- 开发成本较高

## Agent 开发的常见挑战

### 工具调用准确性

LLM 在复杂场景下可能选择错误的工具或参数。提高准确性的方法：
- 为每个工具编写清晰的描述和使用示例
- 限制单次可用工具数量（建议不超过 10 个）
- 使用 Few-shot 示例引导正确的调用模式

### 上下文窗口管理

多步 Agent 执行会产生大量中间结果。策略：
- 对历史步骤做摘要而非保留全部
- 关键信息存入外部记忆
- 使用支持长上下文的模型（如 Claude 200K）

### 安全与对齐

Agent 拥有工具调用能力后，安全风险显著增加：
- 对敏感操作（删除、写入、发送）增加人工确认环节
- 限制 Agent 的网络访问范围
- 记录所有工具调用日志用于审计

## 实践建议

对于刚开始构建 Agent 的团队，建议路径：
1. 先用 Claude Agent SDK 或 OpenAI Assistants API 快速验证想法
2. 确认场景有效后，逐步迁移到自建方案以获得更大灵活性
3. 初期工具数量控制在 3-5 个，验证通过后再扩展

## 相关主题

- [[提示工程实践]] — Agent 的指令设计比普通 LLM 调用更复杂
- [[大模型应用架构]] — Agent 是 LLM 应用架构的进化方向
`,
  },
  {
    name: 'sample-学习笔记-大模型应用搭建思路.txt',
    content: `2026年4月学习笔记 - 关于LLM应用怎么搭建

最近看了好几个项目的源码，感觉大家都在摸索。记录一下。

一、模型选择
现在可选的模型太多了。OpenAI的GPT-4o还是最强的但是贵，Claude在长文本上好用，国内的MiniMax中文不错而且不用翻墙，DeepSeek便宜。感觉一般项目用MiniMax或者DeepSeek就够了，对质量要求高的用GPT-4o或者Claude。

二、Prompt设计
prompt真的太重要了。同一个问题，prompt写得好坏结果差很多。我觉得最重要的是：
- 把角色说清楚，不要模糊
- 输出格式要明确，最好给例子
- 复杂问题让模型分步思考
看到有个项目用了个技巧，把prompt分成system和user两部分，system里放不变的规则，user里放具体问题，效果很好。

三、要不要用RAG
很多项目一上来就上RAG，但其实大部分场景不需要。RAG的问题是：
1. 向量数据库要额外维护
2. 检索回来的片段经常不是最相关的
3. 每次都要重新检索，token消耗大
4. 知识没有积累

最近有个新概念叫LLM Wiki，是把资料提前编译成wiki页面，用的时候直接查wiki不用每次检索原始文档。感觉这个思路更合理，特别是个人知识管理这种场景。比RAG省token，而且知识会越积累越多。

四、架构选型
现在主流的几种架构：
- 简单的：直接调API，适合初期验证
- RAG：适合海量文档问答
- Agent：适合需要多步操作的复杂任务
- LLM Wiki：适合知识积累型的应用

大多数项目其实用简单模式就够了。别过早优化。

五、成本控制
大模型API调用真的贵。几个省钱方法：
1. 用Prompt Caching（Anthropic家的），重复的system prompt不重复收费
2. 能缓存的就缓存，别每次都调API
3. 简单任务用小模型（GPT-4o-mini、DeepSeek），复杂任务用大模型
4. 批处理比实时调用便宜

六、还没搞懂的问题
- Function Calling的最佳实践到底是什么
- 怎么评估Agent的质量
- 流式输出的时候怎么做好用户体验
- 本地模型（Ollama）到底能不能用在生产环境

感觉还需要多看几个项目。
`,
  },
  {
    name: 'sample-LLM应用性能优化.md',
    content: `# LLM 应用性能优化实践

## 延迟优化

### 流式输出

对于需要实时交互的场景（聊天、写作助手），流式输出是改善用户体验的最有效手段。

` + cb + `javascript
// OpenAI SDK streaming example
const stream = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [...],
  stream: true,
});
for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || '');
}
` + cb + `

关键指标：首 Token 延迟（TTFT，Time To First Token）应控制在 500ms 以内。

### 请求合并

当多个用户请求相似时，可以通过 Prompt Caching 或语义缓存减少重复计算。

Anthropic 的 Prompt Caching 可以将长 system prompt 缓存在服务器端，后续请求只需支付增量 Token 费用。实测可降低 70-90% 的 prompt token 成本。

## 成本优化

### 分层模型策略

| 任务复杂度 | 推荐模型 | 相对成本 |
|-----------|---------|---------|
| 简单分类、关键词提取 | DeepSeek V3 / GPT-4o-mini | 基准 |
| 中等推理、内容生成 | GPT-4o / Claude Sonnet | 10-20x |
| 复杂推理、代码生成 | GPT-4.5 / Claude Opus | 50-100x |
| Agent 多步决策 | Claude Opus 4.7 | 100-200x |

### 缓存策略

1. **精确缓存**：相同输入返回缓存结果，命中率通常 5-15%
2. **语义缓存**：相似输入返回缓存结果，命中率可达 30-50%
3. **Prompt Caching**：缓存 system prompt 等固定前缀

## 可靠性优化

### 重试与退避

` + cb + `python
import time
import random

def call_llm_with_retry(prompt, max_retries=3):
    for attempt in range(max_retries):
        try:
            return api.chat.completions.create(...)
        except RateLimitError:
            if attempt == max_retries - 1:
                raise
            # exponential backoff + jitter
            time.sleep((2 ** attempt) + random.random())
` + cb + `

### 降级策略

当主模型不可用或超时时，自动切换到备用模型：

- 主模型超时 30s → 切换到备选模型重试
- 主模型连续失败 3 次 → 降级到更简单的模型
- 速率限制触发 → 排队等待，告知用户预计等待时间

## 监控指标

生产环境应持续监控以下指标：

- TTFT（首 Token 延迟）：P50 < 500ms, P99 < 2s
- 端到端延迟：P50 < 3s, P99 < 10s
- Token 效率：输出 Token / 输入 Token 比率
- 错误率：4xx + 5xx 比例 < 1%
- 缓存命中率：目标 > 30%

## 相关主题

- [[AI Agent开发入门]] — Agent 场景对延迟和可靠性要求更高
- [[大模型应用架构]] — 不同架构的性能特征对比
`,
  },
]
