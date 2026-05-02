// Sample data for KnowCompile — gstack and superpowers introductions

export interface SampleFile {
  name: string
  content: string
}

const cb = '```'

export const SAMPLE_FILES: SampleFile[] = [
  {
    name: 'sample-超好用的skill之gstack.md',
    content: `# gstack 系统介绍

## 什么是 gstack

gstack 是 Y Combinator CEO Garry Tan 开源的 AI 工程工作流系统——将 Claude Code 变成虚拟工程团队。23 个专业角色（CEO 评审、工程经理、设计师、QA、安全审计、发布工程师），全部通过斜杠命令调用，MIT 开源许可。

核心理念：**Think → Plan → Build → Review → Test → Ship → Reflect**，每个技能的输出自动流入下一个技能。

## 核心工作流

### 构思阶段

| 命令 | 角色 | 作用 |
|------|------|------|
| \`/office-hours\` | YC Office Hours | 6 个强制问题，在写代码前重新定义产品方向 |
| \`/plan-ceo-review\` | CEO 评审 | 四种模式：扩展/选择性扩展/保持范围/缩减 |
| \`/plan-eng-review\` | 工程经理 | 锁定架构、数据流、边界条件、测试策略 |
| \`/plan-design-review\` | 高级设计师 | 每个设计维度 0-10 评分，AI 审美检测 |
| \`/autoplan\` | 评审流水线 | 一键完成 CEO → 设计 → 工程评审全流程 |

### 评审与测试

| 命令 | 角色 | 作用 |
|------|------|------|
| \`/review\` | 高级工程师 | 找到 CI 通过但生产环境会炸的 bug |
| \`/investigate\` | 调试专家 | 系统化根因调试，不调查完不许修 |
| \`/qa\` | QA 负责人 | 打开真实浏览器测试、修 bug、原子化提交、回归验证 |
| \`/qa-only\` | QA 报告员 | 只报告不改代码 |
| \`/cso\` | 首席安全官 | OWASP Top 10 + STRIDE 威胁模型 |

### 浏览器能力

| 命令 | 作用 |
|------|------|
| \`/browse\` | 真实 Chromium 浏览器，~100ms/指令，约 70 个原子化命令 |
| \`/setup-browser-cookies\` | 从 Chrome 导入 Cookie，测试需要登录的页面 |
| \`/pair-agent\` | 多 AI Agent 协同——不同 AI 各自在同一个浏览器中独立工作 |

### 发布与运维

| 命令 | 作用 |
|------|------|
| \`/ship\` | 同步 main、跑测试、覆盖率审计、push、开 PR |
| \`/document-release\` | 自动更新所有项目文档匹配最新代码 |

### 安全工具

| 命令 | 作用 |
|------|------|
| \`/careful\` | 危险命令前警告（rm -rf、DROP TABLE、force-push） |
| \`/freeze\` | 锁定编辑范围到一个目录，防止意外修改 |
| \`/guard\` | 同时启用 careful + freeze |

## 安装（30 秒）

\`\`\`bash
git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack && cd ~/.claude/skills/gstack && ./setup
\`\`\`

## 核心设计理念

1. **技能串联**：每个技能的输出是下一个技能的输入。\`/office-hours\` → \`/plan-ceo-review\` → \`/plan-eng-review\` → \`/qa\`
2. **多 Agent 并行**：结合 Conductor 可同时跑 10-15 个并行 Sprint，每个在独立工作空间中
3. **持续检查点**：自动 WIP 提交，崩溃后可恢复上下文，\`/ship\` 时 squash WIP 提交
4. **提示注入防御**：Sidebar Agent 内置多层防御（ML 分类器 + Haiku 验证 + Canary Token）

## 适用场景

- **技术型创始人/CEO**：保持出码能力的同时管理公司
- **首次使用 AI 编程**：结构化角色代替空白 prompt
- **技术负责人**：每次 PR 的严格评审、QA、发布自动化
- **10 种 AI Agent 兼容**：Claude Code、Codex CLI、Cursor、OpenCode、Hermes 等

## Garry Tan 的实际数据

2026 年 YTD：逻辑代码变更效率是 2013 年的 **240 倍**（排除 AI 膨胀后的标准化计算），40+ 已发布功能，3 个生产服务。Garry 全职运营 Y Combinator，编程全部通过 AI Agent 完成。

## 相关主题

- [[Superpowers 插件]]
- [[AI Agent开发入门]]
- [[LLM应用性能优化]]
`,
  },
  {
    name: 'sample-superpowers插件介绍.md',
    content: `# Superpowers 插件介绍

## 什么是 Superpowers

Superpowers 是 Jesse Vincent（Prime Radiant）为 AI 编程 Agent 构建的完整软件开发方法论。它不是零散的命令集合，而是一套**自动触发**的强制工作流系统——Agent 在执行任何任务前都会检查相关技能是否适用。

核心理念：**在写代码之前先思考**。Agent 不会一上来就写代码，而是先引导你理清需求、设计架构、制定计划，然后按计划自动执行。

## 核心工作流（7 步）

| 步骤 | 技能 | 触发时机 | 作用 |
|------|------|----------|------|
| 1 | \`brainstorming\` | 任何创意工作之前 | 苏格拉底式提问，在写代码前理清产品方向 |
| 2 | \`using-git-worktrees\` | 设计评审通过后 | 创建隔离工作空间，保护主分支 |
| 3 | \`writing-plans\` | 设计确定后 | 将工作拆分为 2-5 分钟的小任务，每任务含精确路径和验证步骤 |
| 4 | \`subagent-driven-development\` | 计划完成后 | 按任务逐个 dispatch 子 Agent，两级评审（需求合规 → 代码质量） |
| 5 | \`test-driven-development\` | 实现代码期间 | RED-GREEN-REFACTOR：先写失败测试 → 看它失败 → 写最小代码 → 看它通过 |
| 6 | \`requesting-code-review\` | 任务完成后 | 对照计划评审，严重问题阻止继续 |
| 7 | \`finishing-a-development-branch\` | 全部任务完成 | 合并/PR/保留/丢弃选项，清理工作空间 |

## 技能分类

### 测试

| 技能 | 作用 |
|------|------|
| \`test-driven-development\` | RED-GREEN-REFACTOR 循环，含测试反模式参考 |
| \`systematic-debugging\` | 4 阶段根因调试（含根因追踪、纵深防御、条件等待） |
| \`verification-before-completion\` | 在声明"修好了"之前运行验证命令 |

### 协作

| 技能 | 作用 |
|------|------|
| \`brainstorming\` | 苏格拉底式设计优化 |
| \`writing-plans\` | 详细实现计划 |
| \`dispatching-parallel-agents\` | 并行分派 2+ 个子 Agent 处理独立任务 |
| \`executing-plans\` | 批量执行，每个检查点需要人工确认 |
| \`requesting-code-review\` | 对照计划评审 |
| \`receiving-code-review\` | 处理评审反馈，要求技术验证而非表面同意 |

## 核心哲学

1. **测试驱动开发**：永远先写测试。敢于删除先写实现的代码
2. **系统化而非临时方案**：流程优先于猜测
3. **简单性优先**：复杂度缩减是首要目标
4. **证据优于断言**：先验证再宣告成功

## 安装方式

### Claude Code

\`\`\`bash
/plugin install superpowers@claude-plugins-official
\`\`\`

### 其他平台

- **Codex CLI**: \`/plugins\` → 搜索 \`superpowers\`
- **Cursor**: \`/add-plugin superpowers\`
- **Gemini CLI**: \`gemini extensions install https://github.com/obra/superpowers\`

## 与 gstack 的对比

| 维度 | Superpowers | gstack |
|------|-------------|--------|
| 定位 | 开发方法论 + 技能系统 | 虚拟工程团队 + 斜杠命令 |
| 触发方式 | 自动检测触发 | 用户手动调用 |
| 核心流程 | Think → Plan → TDD → Review | Think → Plan → Build → Review → Test → Ship → Reflect |
| 作者 | Jesse Vincent (Prime Radiant) | Garry Tan (Y Combinator CEO) |
| 强项 | 方法论的严谨性和系统性（强制 TDD、隔离工作空间） | 多角色覆盖和浏览器测试能力 |

两者可以互补使用——Superpowers 提供开发流程纪律，gstack 提供专业角色和浏览器测试。

## 相关主题

- [[超好用的skill之gstack]]
- [[AI Agent开发入门]] — AI Agent 编程的底层能力
`,
  },
]
