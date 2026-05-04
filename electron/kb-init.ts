import fs from 'fs'
import path from 'path'

const DEFAULT_SYSTEM = `# 系统指令

你是 KnowCompile 的知识编译助手。你的任务是将原始资料转化为结构化、可查询的 Wiki 页面。

## 基本原则

1. 使用简体中文回复
2. 严格忠实于原始资料，不编造原文中不存在的信息
3. 保持客观，明确区分事实与观点
4. 遇到矛盾信息时不掩盖，明确标注并给出双方来源
5. 所有结论标注来源（\`> 来源：文件名\`）
6. 使用 [[双向链接]] 连接相关概念

## 行为准则

- 不质疑资料的选题或质量 — 即使内容不完美，也尽量编译
- 不输出主观评价（如"这段写得很好""内容有深度"等），只陈述知识
- 输出格式见 compile-rules.md，链接规范见 links-rules.md
`

const DEFAULT_COMPILE_RULES = `# 编译规则

## 何时编译

- 用户将新文件放入 raw/ 目录后手动触发
- 用户请求重新编译某个页面时

## 页面拆分规则

**核心原则：一个 Wiki 页面 = 一个可独立阅读的、有足够深度的知识主题。**

- 相关内容合并在一个页面，只在主题差异大且各自内容足够独立成文时才拆分
- 一个页面至少包含 1 个小节（## 标题）、总计 300 字以上实质性内容，是可独立阅读的知识单元
- 拆分新页面前先问："这个主题值得其他页面链接过来吗？读者独立打开它有意义吗？"
- 尊重原文结构：一篇文档通常就是一个完整的知识单元，不应被拆散
- 跨文档合并：如果多篇文档讨论同一主题，应合并为一篇更全面的页面
- 禁止拆分：一个定义、一个事实、一大段话就能说清的内容
- 页面标题使用中文，简洁明确

## 矛盾检测

- 当新资料与现有 wiki 页面内容冲突时，在页面中标注 ⚠ 矛盾提示
- 标注格式：⚠ 矛盾：[描述矛盾内容]（来源A vs 来源B）

## 输出格式（Few-shot 示例）

以下是正确的输出格式，**必须严格遵守**。每个页面是一个完整的 Markdown 文档。

\`\`\`
---
type: concept
tags: [机器学习, 深度学习]
sources:
  - 机器学习入门.md
updated: 2026-05-04
---

# 卷积神经网络

> 来源：机器学习入门.md

## 定义

卷积神经网络（Convolutional Neural Network，CNN）是一种专门为处理网格化拓扑数据（如图像、视频帧）而设计的深度学习架构。其核心思想是通过卷积运算自动提取输入数据的空间层级特征，避免了传统神经网络中手工设计特征的繁琐过程。CNN 由 Yann LeCun 等人在 1989 年提出，并在 2012 年的 ImageNet 竞赛中凭借 AlexNet 一举确立其在计算机视觉领域的主导地位。

## 核心组件与工作原理

CNN 主要由三种基本层堆叠而成。卷积层使用一组可学习的滤波器在输入数据上滑动扫描，通过局部连接和权值共享大幅减少参数量，同时提取边缘、角点、纹理等初级特征。随着网络加深，高层卷积可以组合低级特征形成语义更丰富的抽象表示，如物体部件乃至完整物体轮廓。

池化层（如最大池化或平均池化）紧随卷积层后进行下采样，降低特征图的空间维度，从而减少计算量和内存占用，同时对微小平移和畸变提供一定的平移不变性。全连接层则位于网络末端，将提取到的分布式特征映射到样本标记空间，输出最终的分类或回归结果。近年来，全连接层有被全局平均池化替代的趋势，以进一步减少参数量。

## 应用与影响

CNN 在图像分类、目标检测、语义分割、人脸识别、医学影像分析等任务中长期保持领先水平。其影响力还扩展至自然语言处理和语音识别领域——TextCNN 和卷积语音模型证明卷积操作同样适用于序列数据。CNN 的成功也催生了 ResNet、Inception、EfficientNet 等一系列改进架构，推动深度学习成为人工智能的核心基础设施。

## 相关主题

- [[深度学习]]
- [[反向传播算法]]
- [[图像分类]]
- [[ResNet 残差网络]]
\`\`\`

**硬性规则：**

1. **每个页面以 \`---\` 开头**（YAML frontmatter 开始标记），不得有前言、开场白或任何文字在它之前
2. frontmatter 必须包含 \`type\`、\`tags\`、\`sources\`、\`updated\` 四个字段
   - \`type\` 取值：\`concept\`（概念）、\`entity\`（实体/工具）、\`synthesis\`（综合/综述）、\`guide\`（指南）、\`tutorial\`（教程）、\`reference\`（参考）、\`troubleshooting\`（排错）
3. \`sources\` 使用 YAML 列表格式（每行 \`  - 文件名\`）
4. frontmatter 结束后正文以 \`# 页面标题\` 开头
5. 标题下方紧跟 \`> 来源：文件名\` 块引用
6. 至少 1 个 \`## 小节\`，页面正文总计 300 字以上（确保是可独立阅读的知识单元，而非词典释义或一句话碎片）
7. 所有内部链接集中在 \`## 相关主题\` 章节，使用 \`- [[页面名]]\` 格式
8. **禁止**自我链接（链接目标 ≠ 当前页面标题）
9. **禁止**重复链接同一个页面
10. 直接输出页面内容，**禁止**用 JSON、代码块或其他格式封装
`

const DEFAULT_STYLE_GUIDE = `# 文风指南

## 页面格式

- 标题使用 # 一级标题
- 正文使用自然段落
- 引用使用 > 块引用，标注来源文件和章节
- 链接使用 [[页面名]] 格式

## 中文规范

- 使用简体中文
- 术语保持统一（如"量子比特"而非混用"量子位元"）
- 英文术语首次出现时附中文翻译
`

const DEFAULT_LINKS_RULES = `# 链接规则

## 何时创建链接

- 两个概念有直接关联时建立双向链接
- 概念A是概念B的子概念时建立父子链接
- 概念A和B属于同一类别时建立同类链接

## 链接格式

- 使用 [[页面名]] 创建内部链接
- 链接目标页面不存在时标注为红色（待创建）

## 正确示例

链接**集中在页面末尾的"相关主题"章节**，正文中用自然语言叙述，不插链接：

\`\`\`
## 核心内容

CNN 通过卷积层提取空间层级特征，池化层进行下采样。这些组件共同构成了现代计算机视觉的基础。

## 相关主题

- [[深度学习]]
- [[反向传播算法]]
- [[图像分类]]
\`\`\`

## 常见错误

**错误 1：链接散落在正文中**

\`\`\`
❌ CNN 是[[深度学习]]中的一个重要架构，使用[[反向传播算法]]进行训练，广泛用于[[图像分类]]。
\`\`\`

正文中的链接打断阅读流。应用自然语言描述概念关系，在末尾"相关主题"统一列出。

**错误 2：自我链接**

\`\`\`
❌ - [[CNN]]      ← 这是 CNN 页面自身，不应链接自己
\`\`\`

**错误 3：重复链接**

\`\`\`
❌ - [[深度学习]]
❌ - [[深度学习]]  ← 重复
\`\`\`

**错误 4：过度链接**

\`\`\`
❌ 相关主题下超过 5 个链接，应只保留最直接相关的
\`\`\`

相关主题建议 2-5 个，只链接最直接相关、读者确实会想跳转过去的页面。
`

const DEFAULT_SCHEMA: Record<string, string> = {
  'system.md': DEFAULT_SYSTEM,
  'compile-rules.md': DEFAULT_COMPILE_RULES,
  'style-guide.md': DEFAULT_STYLE_GUIDE,
  'links-rules.md': DEFAULT_LINKS_RULES,
}

export const SCHEMA_VERSION = 4

function writeVersion(basePath: string): void {
  const versionPath = path.join(basePath, '.ai-notes', 'schema-version')
  fs.writeFileSync(versionPath, String(SCHEMA_VERSION), 'utf-8')
}

function readVersion(basePath: string): number {
  const versionPath = path.join(basePath, '.ai-notes', 'schema-version')
  if (!fs.existsSync(versionPath)) return 0
  try { return parseInt(fs.readFileSync(versionPath, 'utf-8').trim(), 10) || 0 } catch { return 0 }
}

export function checkSchemaUpdate(basePath: string): { updateAvailable: boolean; currentVersion: number; latestVersion: number } {
  const current = readVersion(basePath)
  return { updateAvailable: current < SCHEMA_VERSION, currentVersion: current, latestVersion: SCHEMA_VERSION }
}

export function updateSchema(basePath: string): { success: boolean; updated: string[]; error?: string } {
  try {
    const updated: string[] = []
    for (const [filename, content] of Object.entries(DEFAULT_SCHEMA)) {
      fs.writeFileSync(path.join(basePath, 'schema', filename), content, 'utf-8')
      updated.push(filename)
    }
    writeVersion(basePath)
    return { success: true, updated }
  } catch (error) { return { success: false, updated: [], error: String(error) } }
}

export function initKnowledgeBase(basePath: string): { success: boolean; error?: string } {
  try {
    for (const dir of ['raw', 'wiki', 'schema', '.ai-notes']) {
      const dirPath = path.join(basePath, dir)
      if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true })
    }
    // Write .gitignore if it doesn't exist
    const gitignorePath = path.join(basePath, '.gitignore')
    if (!fs.existsSync(gitignorePath)) {
      fs.writeFileSync(gitignorePath, '.index/\n.ai-notes/\n', 'utf-8')
    }
    for (const [filename, content] of Object.entries(DEFAULT_SCHEMA)) {
      const filePath = path.join(basePath, 'schema', filename)
      if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, content, 'utf-8')
    }
    writeVersion(basePath)
    return { success: true }
  } catch (error) { return { success: false, error: String(error) } }
}

export function getKBPath(): string | null {
  const { app } = require('electron')
  const configPath = path.join(app.getPath('userData'), 'config.json')
  if (fs.existsSync(configPath)) {
    try { const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')); return config.kbPath || null } catch { return null }
  }
  return null
}

export function setKBPath(kbPath: string): void {
  const { app } = require('electron')
  const configPath = path.join(app.getPath('userData'), 'config.json')
  const dir = path.dirname(configPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(configPath, JSON.stringify({ kbPath }, null, 2), 'utf-8')
}
