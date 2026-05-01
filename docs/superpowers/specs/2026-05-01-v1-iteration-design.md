# 知译 KnowCompile v1.0 — 迭代引擎设计规格

## 概述

v1.0 实现 LLM Wiki 的迭代闭环，将 KnowCompile 从"知识编译器"升级为"会自我生长的第二大脑"。核心引入：本地索引层（SQLite + LanceDB + bge-m3 embedding）、语义问答、增量编译、矛盾检测。

## 索引层

### 设计原则

- 三个文件夹（raw/wiki/schema）是唯一真相来源
- `.index/` 全部可随时删除并从三个文件夹重建
- 用户零额外安装——所有组件打包进 Electron

### 存储架构

```
{知识库路径}/
├── raw/                    # 原始资料（不变）
├── wiki/                   # LLM 编译的 Markdown（不变）
├── schema/                 # AI 行为规则（不变）
├── .index/                 # 🆕 索引层（.gitignore，可删除重建）
│   ├── pages.db            # SQLite
│   └── vectors.lancedb/    # LanceDB
└── .ai-notes/              # 应用元数据（保留）
```

### 组件选型

| 组件 | 选型 | 许可 | 捆绑方式 |
|------|------|------|---------|
| 关系型数据库 | better-sqlite3 | MIT | npm 依赖 |
| 向量数据库 | @lancedb/lancedb | Apache 2.0 | npm 依赖 |
| Embedding 模型 | BAAI/bge-m3 (ONNX 量化版) | MIT | Electron extraResources |
| 模型运行时 | @huggingface/transformers (transformers.js v3) | Apache 2.0 | npm 依赖 |

### SQLite 表结构（pages.db）

**pages 表**
```sql
CREATE TABLE pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    hash TEXT NOT NULL,
    summary TEXT,
    tags TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_compiled_at TEXT
);
```

**sources 表**
```sql
CREATE TABLE sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT UNIQUE NOT NULL,
    filename TEXT NOT NULL,
    size INTEGER NOT NULL,
    hash TEXT NOT NULL,
    imported_at TEXT NOT NULL DEFAULT (datetime('now')),
    status TEXT NOT NULL DEFAULT 'pending',  -- pending/compiled/failed
    page_count INTEGER DEFAULT 0,
    last_compiled_at TEXT
);
```

**links 表**
```sql
CREATE TABLE links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_page_id INTEGER NOT NULL REFERENCES pages(id),
    to_page_id INTEGER NOT NULL REFERENCES pages(id),
    context TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(from_page_id, to_page_id)
);
```

**conflicts 表**
```sql
CREATE TABLE conflicts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_id INTEGER NOT NULL REFERENCES pages(id),
    target_page_id INTEGER REFERENCES pages(id),
    description TEXT NOT NULL,
    source1 TEXT NOT NULL,
    source2 TEXT NOT NULL,
    suggested_resolution TEXT,
    status TEXT NOT NULL DEFAULT 'open',  -- open/resolved
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT,
    resolution TEXT
);
```

### LanceDB 结构（vectors.lancedb）

单一 collection：`chunks`

| 字段 | 类型 | 说明 |
|------|------|------|
| vector | float32[1024] | bge-m3 向量 |
| type | string | "page" 或 "source" |
| ref_id | int64 | pages.id 或 sources.id |
| chunk_index | int32 | 块序号 |
| text | string | 块原始文本 |
| created_at | string | 创建时间 |

### Embedding 服务

- 模型文件：`resources/models/bge-m3/`，打包时 `extraResources` 配置
- 主进程启动时加载模型到内存
- 暴露两个接口：
  - `embedTexts(texts: string[]): Promise<number[][]>` — 批量向量化，按 500 字分块
  - `embedQuery(query: string): Promise<number[]>` — 单条查询向量化
- 分块策略：500 字一块，保持段落完整

### 索引重建

设置页提供"重建所有索引"按钮，流程：
1. 删除 `.index/` 目录
2. 扫描 `wiki/` 和 `raw/` 所有文件
3. 重新分块、向量化、写入 LanceDB
4. 重建 SQLite 元数据

---

## 增量编译（5 步）

触发：用户在摄入页点击"编译"

### 步骤 1：新资料向量化
- 转纯文本，按 500 字分块
- `embedTexts(chunks)` 批量生成向量
- 暂存内存

### 步骤 2：相似度检索
- 每个新块向量查 LanceDB `type="page"`，top-100
- 按 `ref_id` 聚合，统计每个页面命中块数和总分
- 取 top-3 作为候选页面

### 步骤 3：LLM 上下文验证 + 矛盾检测
- 输入：新资料摘要 + top-3 候选页面完整内容
- Prompt 追加指令：
  - 判断哪些页面需要更新、哪些章节
  - 对比新旧内容，识别矛盾（数值/观点/事实）
  - 判断是否需要创建新页面
- 输出：更新计划 JSON `{updates: [{page, sections, reason}], new_pages: [{title, reason}], conflicts: [...]}`

### 步骤 4：增量更新
- LLM 根据更新计划生成/修改目标页面
- 不碰无关页面
- 自动更新双向链接

### 步骤 5：更新索引
- 重新分块生成修改页面的向量，写入 LanceDB（覆盖旧向量）
- 更新 SQLite pages 表的 hash、updated_at
- 更新 links 表
- 更新 sources 表状态为 compiled

### 降级策略

Embedding 模型未加载时（首次启动未完成等），退级为现有两阶段 CoT 编译（读取 wiki 所有标题给 LLM 做匹配，而非向量相似度）。

---

## 问答流程（7 步）

### 步骤 1：问题预处理
- 提取关键词
- 生成问题向量 `embedQuery(question)`
- 拼一个简单的关键词布尔查询（摘标题、标签）

### 步骤 2：向量检索
- 问题向量查 LanceDB `type="page"`，top-30，阈值 0.65

### 步骤 3：过滤重排序
- 同页面多块只保留 top-3
- 标题精确匹配权重 ×2，最近更新 ×1.2
- 最终保留 top-8

### 步骤 4：上下文构建
- 从 SQLite pages 表查元数据（标题、来源）
- 格式化：`【页面：标题】【来源：xxx】` + 块内容
- 总长控制在 3000 Token

### 步骤 5：LLM 生成回答
- system prompt 要求：严格基于上下文、不编造、附来源
- 暂不改流式（v1.1）

### 步骤 6：后处理
- 解析回答中的来源引用
- 添加反馈按钮：✅ 有帮助 / ❌ 不准确 / 📝 需更详细

### 步骤 7：知识沉淀
- 显示"归档到 Wiki"按钮，将 Q&A 保存到 `wiki/synthesis/`
- 用户点击"不准确"→ 标记相关页面待重编译
- 用户点击"需更详细"→ 触发后台补全编译（v1.1 完善）

### 降级策略

Embedding 模型未加载时，退级为现有的 flexsearch 关键词匹配 + LLM 直读全文。

---

## 矛盾检测

### 触发时机
编译完成后自动执行（嵌入增量编译步骤 3）。

### 检测范围
只对比新资料向量检索到的 top-3 候选页面，不扫描全部页面。

### 检测方式
LLM 在增量编译步骤 3 的 prompt 中追加指令：对比新旧内容，识别：
- 数值矛盾
- 观点矛盾
- 事实矛盾（日期、版本号、配置等）

### 结果处理
- 写入 SQLite conflicts 表，状态 open
- 在相关页面顶部插入标准标记：
  ```
  > ⚠️ **矛盾待处理**：[描述]。来源：[A] vs [B]。建议：[方案]
  ```
- 设置页新增"矛盾列表"入口

### 不做
不自动解决矛盾，只标记，用户决定。

---

## UI 变更

| 位置 | 变更 |
|------|------|
| 问答页 | 反馈按钮（有帮助/不准确/需更详细）+ 归档按钮 |
| 摄入页 | 编译按钮调用增量编译；编译日志显示候选页面和更新计划 |
| 设置页 | 新增"重建索引"按钮、"矛盾列表"入口 |
| 图谱页 | 支持显示矛盾节点（特殊颜色标记） |

---

## 自动化测试

### 单元测试
- Embedding 服务：文本分块、向量维度校验
- SQLite 服务：CRUD 操作、事务、索引重建
- LanceDB 服务：向量写入、相似度搜索精度
- 搜索服务：过滤重排序逻辑
- 矛盾检测：LLM 输出解析

### 集成测试
- 增量编译端到端（导入资料 → 编译 → 验证索引更新）
- 问答端到端（提问 → 检索 → 回答）
- 索引重建（删除 .index/ → 重建 → 验证一致性）
- 降级策略（无 embedding 时功能正常）

### 回归测试
- 现有编译流程不受影响
- 现有问答流程可降级运行
- Wiki 浏览、图谱、导出功能正常

---

## 不包含（YAGNI，后续版本）

- v1.1：流式回答、查询驱动自动补全、用户偏好学习
- v1.2：定期全局重构、知识库健康检查、图神经网络优化
- 网页链接摄入
- 多知识库
