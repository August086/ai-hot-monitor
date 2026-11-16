# 命令参考

> 全部命令：`node scripts/intel.mjs <command> [args]`。默认输出 JSON；出错时输出 `{"error": "..."}` 并以退出码 1 结束。

- 环境变量：`WATCH_API`（默认 `http://localhost:8787`）、`WATCH_TIMEOUT`（默认 `120000` ms）
- 时间参数：`--hours 48` 与 `--days 2` 等价；`--from/--to` 用 `YYYY-MM-DD`
- 多值参数：逗号分隔，如 `--importance urgent,high`

---

## 1. 组合命令（只读）

### brief —— 简报

```bash
node scripts/intel.mjs brief --hours 24 --limit 5
node scripts/intel.mjs brief --hours 168 --limit 8 --md
node scripts/intel.mjs brief --hours 48 --importance urgent,high --real
node scripts/intel.mjs brief --hours 24 --keyword "Claude Code"
```

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `--hours` | 24 | 时间窗口（有效时间 = 发布时间优先，缺失回落入库时间） |
| `--limit` | 5 | 「值得写」条数上限（1–20） |
| `--importance` | — | 只看指定等级，如 `urgent,high` |
| `--keyword` | — | 只看某个监控词 |
| `--real` | — | 只保留 AI 判定真实的条目 |
| `--sort` | recommended | 底层排序，可换 `latest` / `importance` |
| `--md` | — | 输出 markdown 而不是 JSON |
| `--same-event` | 0.62 | 「同事件」标题相似度阈值 |

返回结构：

```json
{
  "window": "24h",
  "generatedAt": "2026-11-16T07:40:00.000Z",
  "filters": { "importance": null, "keyword": null, "realOnly": false, "sort": "recommended" },
  "counts": { "total": 155, "today": 11, "urgent": 5, "pending": 0, "listed": 42 },
  "top": [
    {
      "id": 159,
      "title": "…",
      "source": "ithome",
      "importance": "high",
      "relevance": 85,
      "summary": "…",
      "reason": "…",
      "publishedAt": "2026-11-16T03:44:18.000Z",
      "publishedAgo": "4 小时前",
      "url": "https://…",
      "alsoIn": [{ "id": 160, "source": "baidu", "url": "https://…" }],
      "caveats": []
    }
  ],
  "suspicious": [{ "id": 1, "title": "…", "source": "baidu", "reason": "…", "url": "…" }],
  "byKeyword": [{ "term": "DeepSeek", "domain": "大模型", "count": 5, "avgRelevance": 58, "pending": 0 }],
  "sameEventThreshold": 0.62,
  "markdown": "# 热点简报 …"
}
```

`alsoIn` 是「同事件的其他来源」：同一事件被多家转载时只占一个「值得写」位置，其余来源记在这里。

### verify —— 选题前核实

```bash
node scripts/intel.mjs verify 159
node scripts/intel.mjs verify --q "DeepSeek 限额"
node scripts/intel.mjs verify --url "https://www.ithome.com/1/027/597.htm"
node scripts/intel.mjs verify 159 --same-event 0.3
```

```json
{
  "via": "id:159",
  "target": { "id": 159, "title": "…", "source": "ithome", "isReal": true, "aiStatus": "analyzed", "caveats": [] },
  "sameEvent": [{ "id": 161, "source": "baidu", "similarity": 0.46, "title": "…", "url": "…" }],
  "sources": { "count": 2, "list": ["ithome", "baidu"] },
  "confidence": "high",
  "advice": "多来源交叉且 AI 判真，可以直接作为选题素材，写作时引用原文链接。",
  "checks": [{ "key": "crossSource", "pass": true, "detail": "来源数：2（ithome / baidu）" }],
  "threshold": 0.62
}
```

`checks` 逐项给出判定依据（AI 结论、研判状态、来源数、是否发现同事件），方便直接复述给用户。

### audit —— 监控词体检

```bash
node scripts/intel.mjs audit
```

```json
{
  "count": 7,
  "summary": { "健康": 4, "无产出": 1, "过宽": 1, "高产": 1 },
  "duplicates": [{ "a": "DeepSeek V4.1", "b": "DeepSeek", "reason": "一个词是另一个词的前缀" }],
  "suggestions": ["「Agentic Coding」无产出：…"],
  "keywords": [
    { "id": 23, "term": "Agent", "last7d": 5, "avgRelevance": 45, "pending": 0, "health": "健康", "hint": "…" }
  ]
}
```

---

## 2. 查询命令（只读）

| 命令 | 说明 |
| --- | --- |
| `stats` | 总量、今日新增、紧急数、待研判、各来源/等级分布、7 日趋势 |
| `hotspots [参数]` | 热点列表，参数见下表 |
| `get <id>` | 单条详情（含 AI 摘要、判定依据、模型名） |
| `keywords` | 监控词列表（含 24h/48h/7d 产出、平均相关度、待研判） |
| `notifications [--limit N]` | 通知历史（sent/failed） |
| `health` | 服务健康与能力矩阵（不含密钥） |

`hotspots` 参数：

| 参数 | 说明 |
| --- | --- |
| `--limit N` | 条数，默认 50，上限 200 |
| `--hours N` / `--days N` | 时间窗口 |
| `--importance urgent,high` | 等级多选 |
| `--source baidu,ithome` | 来源多选 |
| `--status analyzed,heuristic` | AI 状态多选（`pending` / `analyzed` / `heuristic` / `failed`） |
| `--real` / `--fake` / `--unknown` | 可信度三态 |
| `--relevance-min 60` | 相关度门槛 |
| `--engagement-min 100` | 热度门槛 |
| `--keyword "词"` | 监控词精确关联 |
| `--q "deepseek -股价"` | 文本检索：空格多词 AND、`-` 排除、`"短语"` |
| `--title-only` | 只在标题里匹配 |
| `--notified true\|false` | 通知状态 |
| `--from/--to YYYY-MM-DD` | 自定义区间 |
| `--dated` | 只保留有发布时间的条目 |
| `--sort` | `latest` / `importance` / `relevance` / `engagement` / `recommended` / `pending` / `unnotified` |
| `--dir asc\|desc` | 时间/相关度/热度的方向 |

---

## 3. 写操作（执行前必须获得用户确认）

| 命令 | 影响 |
| --- | --- |
| `search <关键词> [--domain 范围] [--no-ai]` | 立即抓取一轮（真实网络请求，10–60s） |
| `collect` | 触发全量采集（所有启用关键词） |
| `analyze <id>` | 重新调用 AI 研判单条（会计费） |
| `pending [--limit N]` | 补研判积压条目（会计费） |
| `add-keyword <词> [--domain 范围]` | 新增监控词 |
| `toggle-keyword <id> <on\|off>` | 启停监控词 |
| `delete-keyword <id>` | 删除监控词（历史热点保留） |

---

## 4. 退出码

| 码 | 含义 |
| --- | --- |
| 0 | 成功 |
| 1 | 参数错误、服务不可用或接口返回错误（stderr 有 `{"error": …}`） |
