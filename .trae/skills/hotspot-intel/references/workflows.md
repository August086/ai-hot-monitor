# 工作流

每条工作流都是「命令序列 + 如何向用户表达」。所有数字都必须来自命令输出。

---

## 1. 早间巡检（最高频）

**触发**：「今天有什么值得写的」「看看昨晚到现在的热点」

```bash
node scripts/intel.mjs brief --hours 24 --limit 5
```

表达要点：

1. 先给一句总览：库内总量、今日新增、紧急数、待研判数（来自 `counts`）。
2. 「值得写」按顺序讲 1–3 条：标题 + 等级 + 相关度 + 来源 + 相对时间，再补一句 `reason`（AI 判定依据）。
3. 有 `alsoIn` 时说明「另有 X 家转载」，不要重复占用条目。
4. 「存疑」区单独说，明确「不建议直接作为选题」。
5. 用户要 markdown 时改用 `--md`，或直接用返回里的 `markdown` 字段。

## 2. 选题前核实

**触发**：「这条能写吗」「这个是真的吗」「帮我确认一下」

```bash
node scripts/intel.mjs verify <id>
# 手头只有标题/链接时
node scripts/intel.mjs verify --q "标题关键词"
node scripts/intel.mjs verify --url "https://…"
```

表达要点：

1. 先给结论：`confidence` 为 `high` / `medium` / `low`，对应「可以直接写 / 先看原文 / 不建议写」。
2. 引用 `checks` 逐项说明依据（AI 结论、研判状态、来源数、是否发现同事件）。
3. `isReal=false` 或 `aiStatus=heuristic` 必须原样标注，不要弱化。
4. 中文媒体常大幅改写标题，默认阈值 0.62 可能漏掉同事件；核实中文转载时可加 `--same-event 0.3` 再跑一次，并把两次结果都告诉用户。
5. 最后给 `advice` 原文，不要自行承诺「已核实为真」——AI 判定不能替代人工核实。

## 3. 事件追踪

**触发**：「DeepSeek 这几天怎么样」「盯着某个词」

```bash
node scripts/intel.mjs hotspots --keyword "DeepSeek" --hours 72 --sort recommended --limit 10
node scripts/intel.mjs verify <最有代表性的一条 id>
```

表达要点：按时间线讲变化（先 `publishedAgo` 新的后旧的），指出哪条是官方来源、哪条是转载、哪条存疑。

## 4. 监控词复盘

**触发**：「哪些关键词该换了」「监控效果怎么样」

```bash
node scripts/intel.mjs audit
```

表达要点：

1. 先给 `summary` 的健康分布。
2. 按「无产出 / 低产 / 过宽 / 重复」四类给建议，每条引用 `hint`。
3. 涉及 `toggle-keyword` / `delete-keyword` 时**先征求同意**，不要直接执行删除。
4. 用户同意后再执行，并回报结果。

## 5. 排障

**触发**：「怎么没数据」「抓取是不是坏了」

```bash
node scripts/intel.mjs health
node scripts/intel.mjs stats
node scripts/intel.mjs notifications --limit 5
```

判断顺序：`health.ok` 是否为 true → 能力矩阵里 `ai` 是否为 true（false 说明只能用启发式）→ `stats.total` 是否长期不涨 → `notifications` 是否大量 `failed`。

结论要落到可执行动作：检查 `.env`、重启服务、手动 `collect`（需同意）、或降低抓取频率。
