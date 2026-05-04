# 贡献指南

## 开发环境

```bash
# 安装依赖
npm install

# 首次运行后如果 better-sqlite3 报 NODE_MODULE_VERSION 错误
npm rebuild better-sqlite3

# 启动开发服务器（Vite + Electron）
npm run dev
```

## 运行测试

```bash
# 全量测试（需要 LLM API 凭证，约 5-8 分钟）
npm test

# 跳过 LLM 集成测试（仅单元测试，约 30 秒）
npx vitest run --exclude='tests/llm-service*' --exclude='tests/compile-pipeline*' --exclude='tests/qa-pipeline*' --exclude='tests/compile-service*'

# 运行单个测试文件
npx vitest run tests/qa-pipeline.test.ts --test-timeout=300000
```

## 测试分类

| 类型 | 文件 | 需要 LLM API？ | 需要 embedding 模型？ |
|------|------|:---:|:---:|
| 单元测试 | `index-db`, `llm-logger`, `vector-db`, `exporter`, `embedding-service`, `search-indexer`, `compile-validator`, `wiki-normalizer`, `kb-init`, `qa-service` | 否 | 部分 |
| 渲染层测试 | `src/electron-utils`, `src/components/*` | 否 | 否 |
| LLM 集成 | `llm-service`, `compile-service` | 是 | 否 |
| 管道集成 | `compile-pipeline`, `qa-pipeline` | 是 | 是（bge-m3 ~568MB） |
| 质量评审 | `compile-prompt-review` | 是 | 否 |

## LLM API 配置

管道集成测试需要 LLM 凭证。应用配置自动保存在 `%APPDATA%/knowcompile/settings.json`，测试通过 `tests/helpers/llm-setup.ts` 读取。

也可使用环境变量覆盖：

```bash
export KNOWCOMPILE_API_KEY="sk-..."
export KNOWCOMPILE_PROVIDER="openai"      # 可选
export KNOWCOMPILE_BASE_URL="https://..."  # 可选
export KNOWCOMPILE_MODEL="gpt-4o"         # 可选
```

## 提交规范

- `feat:` — 新功能
- `fix:` — 修复
- `refactor:` — 重构
- `test:` — 测试
- `docs:` — 文档
- `chore:` — 构建/工具
- `improve:` — 非功能性改进（prompt、validator、代码质量）

## 编译提示词质量评审

```bash
# 用真实 schema 和 raw 文件评审编译提示词质量
npx tsx tests/compile-prompt-review.ts <kbPath> [rawFile1 rawFile2 ...]
```

## 项目结构

参见 [ARCHITECTURE.md](./ARCHITECTURE.md)。
