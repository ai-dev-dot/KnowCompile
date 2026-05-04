# gstack

Use the /browse skill from gstack for all web browsing. Never use mcp__claude-in-chrome__* tools.

## Available skills

/browse, /connect-chrome, /setup-browser-cookies, /qa, /qa-only, /design-review, /review, /ship, /land-and-deploy, /canary, /benchmark, /office-hours, /plan-ceo-review, /plan-eng-review, /plan-design-review, /plan-devex-review, /devex-review, /design-consultation, /design-shotgun, /design-html, /setup-deploy, /setup-gbrain, /retro, /investigate, /document-release, /codex, /cso, /autoplan, /careful, /freeze, /guard, /unfreeze, /gstack-upgrade, /learn

## Skill routing

**Default: superpowers.** For implementation tasks (debugging, TDD, code review,
brainstorming, executing plans, etc.), use superpowers skills as directed by their rules.

**gstack: name-explicit only.** gstack skills are NOT registered as slash commands.
Invoke a gstack skill ONLY when the user explicitly says its name in natural language
(e.g., "用 plan-ceo-review 评审方案"). Never auto-invoke a gstack skill based on the
semantic content of the user's request — the user must name the skill.

Available gstack skills (invoke by name, not `/` prefix):
office-hours, plan-ceo-review, plan-eng-review, plan-design-review,
plan-devex-review, autoplan, investigate, qa, qa-only, review (gstack),
design-review, devex-review, design-consultation, ship, land-and-deploy,
canary, cso, context-save, context-restore, browse, retro, learn

## Project: KnowCompile

Electron 桌面应用 — AI 资料编译为结构化 Wiki。

**技术栈:** Electron + React 19 + TypeScript + Vite + Tailwind CSS + SQLite + LanceDB

**命令:**
- `npm run dev` — Vite 开发服务器 + Electron
- `npm test` / `npx vitest run` — 全量测试（后端 node + 渲染层 jsdom）
- `npx vitest run src/` — 仅渲染层测试（jsdom + @testing-library/react）

**测试架构:**
- `tests/` — 后端测试，node 环境（260 个通过）
- `src/*.test.{ts,tsx}` — 渲染层测试，jsdom 环境（45 个通过）
- `src/test-utils/mock-ipc.ts` — IPC mock 工厂，覆盖 40+ 通道
- `src/test-utils/render.tsx` — 组件测试入口，自动 stub window.electronAPI

**关键模式:** 组件测试不依赖 Electron；mock IPC 工厂为每个组件提供隔离的 IPC 模拟
