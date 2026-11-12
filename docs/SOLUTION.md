# 技术方案 · NEON//WATCH AI 热点监控中枢

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v1.6 |
| 日期 | 2026-11-12 |
| 状态 | 已实现并通过验收（Twitter 数据源待密钥联调） |
| 关联需求 | [REQUIREMENTS.md](./REQUIREMENTS.md) |
| 技术选型 | [TECH_SELECTION.md](./TECH_SELECTION.md) |
| 代码位置 | `server/`（后端）、`web/`（前端）、`.trae/skills/neon-watch/`（Agent Skill） |

---

## 1. 目标与边界

为 AI 编程博主提供一条自动化的热点情报流水线：**定时抓取 → 去重 → AI 真假/价值研判 → 实时推送 → 邮件通知**，并附带可被其他 AI 调用的 Agent Skill。

范围内：关键词管理、多源抓取、AI 研判、WebSocket 推送、SMTP 邮件、历史记录、响应式控制台、Agent Skill。

范围外：多租户账号体系、云端部署编排、模型自训练、Twitter 写操作。

---

## 2. 需求到实现映射

| 需求项 | 实现位置 | 说明 |
| --- | --- | --- |
| 关键词增删改查 | `server/src/routes/keywords.js` | 唯一约束、长度校验、启用开关 |
| 30 分钟定时抓取 | `server/src/scheduler.js` | 30 秒 tick 检查，间隔可在设置页改 |
| 多数据源 | `server/src/services/sources/*` | HN + 国内科技媒体 RSS + 百度资讯；Bing/arXiv/GDELT 默认关闭 |
| 质量闸门 | `sources/match.js`、`hackernews.js`、`baidu.js`、`collector.js` | 关键词守卫、HN 5/2、百度白名单、单源配额 |
| 时效过滤与排序 | `collector.js`、`db.js listHotspots` | 48h 时效；发布时间优先，无时间条目排后 |
| AI 真假识别 | `server/src/services/ai.js` | json_schema 强约束输出 |
| 重复过滤 | `server/src/services/dedupe.js` | URL 指纹 + 中文标题相似度 |
| 浏览器推送 | `server/src/ws.js` | 原生 WebSocket，事件 `hotspot:new` |
| 邮件通知 | `server/src/services/notifier.js` | nodemailer + HTML 模板 |
| 通知设置/历史 | `routes/settings.js`、`routes/notifications.js` | 阈值、收件人、通道开关 |
| SIGNAL DESK UI | `web/src/styles.css`、`styles-v2.css`、`components/*` | 手写设计系统 + Aceternity 动效组件 |
| Agent Skill | `.trae/skills/neon-watch/` | SKILL.md + 无依赖 CLI |

---

## 3. 技术选型

| 层 | 选型 | 依据 |
| --- | --- | --- |
| 运行时 | Node.js 24.21 | 原生 `node:sqlite` 可用，免去 `better-sqlite3` 的原生编译 |
| Web 框架 | Express 5.1 | 原生支持 async 路由错误传递 |
| 数据库 | SQLite（WAL） | 单机 7x24、零运维，JSON 字段需求少 |
| 抓取 | fetch + cheerio | 轻量、可控 UA/限速/重试 |
| 资讯源 | HN(Algolia) + 4×国内科技媒体 RSS + 百度资讯 | 全部免密钥；只保留有稳定发布时间、可验证相关性的源 |
| 实时 | ws 8.18 | 原生 WebSocketServer，可直接挂 HTTP server |
| 邮件 | nodemailer 7 | 支持 QQ/163/Gmail/Outlook SMTP |
| 调度 | 自研 tick 调度 | 间隔可从数据库热更新，无需重启 cron |
| 前端 | React 19 + Vite 7 + TypeScript 5.9 + Tailwind CSS 4 + Aceternity UI + Motion | 组件化 + 秒级构建；动效组件按需引入，产物约 150KB gzip |
| AI | OpenRouter Chat Completions | 统一多模型接入，支持结构化输出 |

---

## 4. MCP 实时校验结论（2026-11-11）

按要求通过 MCP（Firecrawl）抓取官方文档核对接口，避免使用过时写法。结论如下：

### 4.1 OpenRouter（Chat Completions）

来源：[API Reference](https://openrouter.ai/docs/api_reference/overview)、[Structured Outputs](https://openrouter.ai/docs/guides/features/structured-outputs)，抓取时间 2026-11-11。

- 端点：`POST https://openrouter.ai/api/v1/chat/completions`。
- 必需 Header：`Authorization: Bearer <key>`、`Content-Type: application/json`。
- 可选 Header：`HTTP-Referer`、**`X-OpenRouter-Title`**（旧写法为 `X-Title`，已按新文档改为 `X-OpenRouter-Title`）。
- 结构化输出：Chat Completions 使用
  `response_format: { type: "json_schema", json_schema: { name, strict, schema } }`；
  旧写法 `json_object` 不再作为推荐方案。
- 建议同时传 `provider: { require_parameters: true }`，只路由到支持结构化输出的端点，避免返回非 JSON。
- 模型支持按端点判定：同一模型的不同供应商支持情况可能不同。

> 落地结果：`server/src/services/ai.js` 已改为 `json_schema + strict`，并实测 DeepSeek 端点返回严格 JSON。
> 需要说明的是，实测开启 `require_parameters: true` 后，DeepSeek 的部分端点未在能力表中声明 `structured_outputs`，导致主模型被路由跳过并直接落到备用模型；因此最终**未启用**该参数，改由「严格 Schema + JSON 解析失败自动降级」保证稳定性。

### 4.2 twitterapi.io（Advanced Search）

来源：[Advanced Search 文档](https://docs.twitterapi.io/api-reference/endpoint/tweet_advanced_search)，抓取时间 2026-11-11。

- 端点：`GET https://api.twitterapi.io/twitter/tweet/advanced_search`。
- Header：`X-API-Key`。
- 参数：`query`（必填）、`queryType`（必填，枚举 **`Latest` / `Top`**，默认 `Latest`）、`cursor`（首页为空串）。
- 返回：`tweets[]`、`has_next_page`、`next_cursor`；tweet 含 `id/url/text/createdAt/likeCount/retweetCount/replyCount/quoteCount/viewCount/author{}`。
- 每页最多约 20 条。

> 落地结果：`server/src/services/sources/twitter.js` 的路径、Header、`queryType=Top`、字段映射均与文档一致；尚未真实调用（缺 `TWITTERAPI_KEY`）。

### 4.3 模型区域可用性（实测）

通过 OpenRouter 直接探测发现，当前出口区域下 OpenAI / Anthropic / Google 模型均返回 `403 This model is not available in your region`。

可用且实测通过：`deepseek/deepseek-v4.1-flash-1017`、`deepseek/deepseek-v4-pro-0813`、`moonshotai/kimi-k3`、`z-ai/glm-5.3`、`qwen/qwen3.8-max-0902`。

因此默认配置为：

```ini
OPENROUTER_MODEL=deepseek/deepseek-v4.1-flash-1017
OPENROUTER_FALLBACK_MODEL=moonshotai/kimi-k3
```

---

## 5. 系统架构

```
┌───────────────────────────── 浏览器（React SPA） ─────────────────────────────┐
│  仪表盘 / 热点流 / 关键词 / 设置        SIGNAL DESK 设计系统 + 动效组件        │
└───────────────▲───────────────────────────────────▲──────────────────────────┘
                │ REST /api/*                       │ WS /ws
┌───────────────┴───────────────────────────────────┴──────────────────────────┐
│ Express 5                                                                     │
│  routes: keywords · hotspots · settings · notifications · system              │
│  ws.js：连接管理 / 心跳 / 广播 / 关键词订阅                                     │
│  scheduler.js：30s tick，按 settings.collectInterval 触发，日切清理              │
└───────────────┬──────────────────────────────────────────────────────────────┘
                │
        ┌───────▼────────┐   抓取    ┌────────────────────────────────────┐
        │ collector.js   │──────────▶│ HN / 4×RSS / 百度资讯（其余可开关）│
        │ 编排 + 时效+去重 │           └────────────────────────────────────┘
        │ AI 研判 + 通知  │──────────▶ OpenRouter（主模型 → 备用 → 启发式）
        └───────┬────────┘──────────▶ SMTP（nodemailer）
                │
        ┌───────▼────────┐
        │ SQLite (WAL)   │ keywords / hotspots / notifications / settings / runs
        └────────────────┘
```

关键约束：
- 单进程即可运行（`npm start`），静态前端由 Express 托管，端口 8787。
- 采集有全局互斥锁，定时与手动触发不会并发。
- 每轮最多处理 `MAX_KEYWORDS_PER_RUN` 个关键词、`AI_MAX_ITEMS_PER_RUN` 条新热点，剩余额度自动补研判历史积压。

---

## 6. 目录结构

```
server/
  src/
    config.js              环境变量解析与边界校验
    db.js                  node:sqlite 建表 + DAO
    index.js               HTTP 服务 / 静态托管 / 启动横幅
    scheduler.js           周期调度与数据清理
    ws.js                  WebSocket 连接与广播
    routes/                keywords / hotspots / settings / notifications / system
    services/
      collector.js         采集编排
      dedupe.js            URL 指纹 + 标题相似度
      ai.js                OpenRouter 研判与降级
      notifier.js          WS + 邮件分发
      sources/match.js     关键词相关性守卫
      sources/hackernews.js Algolia 搜索（48h，5/2 门槛）
      sources/rss.js       国内科技媒体 RSS（48h，关键词过滤）
      sources/baidu.js     百度资讯（48h，白名单媒体）
      sources/bing.js      Bing（默认关闭）
      sources/arxiv.js     arXiv（默认关闭）
      sources/gdelt.js     GDELT（默认关闭）
      sources/huggingface.js 模型上新（默认关闭）
      sources/twitter.js   twitterapi.io（可选）
  scripts/seed.js          演示数据（手动执行）
  test/sources.test.js     来源与质量闸门单测
  test/smoke.test.js       API 冒烟测试
web/
  src/
    App.tsx                布局、路由（hash）、WS 状态、Toast
    pages/                 Dashboard / Hotspots / Keywords / Settings
    components/            Backdrop / Primitives / HotspotCard / Drawer / Layout
    hooks/useLive.ts       WS 重连与事件分发
    styles.css             设计令牌与基础组件样式
    styles-v2.css          SIGNAL DESK 布局、响应式与可访问性覆盖层
.trae/skills/neon-watch/   Agent Skill（SKILL.md + scripts/watch.mjs）
```

---

## 7. 数据模型

| 表 | 关键字段 | 说明 |
| --- | --- | --- |
| `keywords` | `term UNIQUE`、`domain`、`enabled`、`last_checked_at` | 监控词；范围限定拼进检索语句 |
| `hotspots` | `fingerprint UNIQUE`、`source`、`is_real`、`relevance`、`importance`、`summary`、`ai_status`、`notified` | 热点主表 |
| `notifications` | `hotspot_id`、`channel`、`status`、`detail` | 通知审计 |
| `settings` | `key/value` | 通知开关、阈值、收件人、间隔、保留天数、监控范围 |
| `runs` | `trigger`、`status`、`found`、`created`、`analyzed`、`error` | 每轮采集记录 |

`ai_status` 取值：`pending` / `analyzed` / `heuristic` / `failed`。`heuristic` 明确表示未调用大模型，前端以 `H` 角标提示。

索引：`hotspots(created_at DESC)`、`hotspots(keyword_id)`、`hotspots(importance)`。

---

## 8. API 契约（实际实现）

### 8.1 关键词

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/keywords` | 列表 |
| POST | `/api/keywords` | 新增，重复返回 409 |
| PUT | `/api/keywords/:id` | 改名/范围/启停 |
| DELETE | `/api/keywords/:id` | 删除（历史热点保留） |

### 8.2 热点

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/hotspots` | 过滤：`limit/offset/importance/source/isReal/status/keyword/q/qMode/days/hours/from/to/dated/notified/relevanceMin/engagementMin`；`importance/source/status/isReal` 支持逗号多值；排序：`sort=latest\|importance\|relevance\|engagement\|recommended\|pending\|unnotified`，`dir=asc\|desc` |
| GET | `/api/hotspots/:id` | 详情 |
| POST | `/api/hotspots/search` | 即时抓取，body `{term, domain?, analyze?}` |
| POST | `/api/hotspots/:id/analyze` | 单条重新研判 |

### 8.3 设置与通知

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/settings` | 设置 + 能力矩阵（不返回密钥） |
| PUT | `/api/settings` | 白名单字段更新 + 格式校验 |
| POST | `/api/settings/test-email` | SMTP 自检 |
| GET | `/api/notifications` | 通知历史 |

### 8.4 系统

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 + 能力标记 |
| GET | `/api/stats` | 统计聚合（等级/来源/7 日趋势） |
| GET | `/api/runs` | 采集历史 |
| POST | `/api/collect` | 手动触发一轮（可传 `keywordIds`） |
| POST | `/api/analyze-pending` | 补研判积压 |

### 8.5 WebSocket

- 连接：`ws://host/ws`
- 服务端事件：`connected`、`hotspot:new`、`hotspot:update`、`stats:update`、`run:update`、`notification`、`presence`
- 客户端事件：`subscribe {keywords}`、`unsubscribe`、`ping`
- 心跳：服务端 30s ping/pong；客户端 20s 应用层 ping。

### 8.6 检索与排序

**排序实现**（`db.js listHotspots` 的 `ORDER BY` 分支）

| sort | 规则 |
| --- | --- |
| `latest` | 无发布时间沉底 → 有效时间 → 等级 |
| `importance` | 等级 → 无时间沉底 → 有效时间 |
| `relevance` | 有相关度优先 → 相关度 → 时间 |
| `engagement` | 有热度优先 → 热度 → 时间 |
| `recommended` | 综合分 → 无时间沉底 → 时间 |
| `pending` | `pending/failed` 优先 → 时间 |
| `unnotified` | `notified = 0` 优先 → 时间 |

综合推荐分（纯 SQL 计算，不落库，随研判结果实时变化）：

```
等级（urgent 100 / high 70 / medium 40 / low 15 / 未评 25）× 0.4
+ relevance × 0.3
+ 48h 新鲜度（线性衰减）× 20
+ 热度分档（≥1000→10、≥300→8、≥100→6、≥30→4、>0→2）× 1
− isReal=false 25
− aiStatus=pending/failed 15
```

**筛选实现**：`importance/source/status` 逗号多值转 `IN (...)`；`isReal` 支持 `real/fake/unknown` 三态组合；`hours/days/from/to` 统一作用于有效时间（`COALESCE(published_at, created_at)`）；`relevanceMin/engagementMin` 为数值门槛；`notified` 过滤推送状态。

**前端交互**（`hooks/useHotspotFilters.ts` + `components/HotspotFilters.tsx`）

- 首屏只保留等级多选、可信度四态、排序下拉与「更多筛选」入口；其余条件收进右侧抽屉。
- 已激活条件以 pill 行展示，支持逐项移除与「清空全部」。
- 4 个内置预设 + 本机保存的自定义视图（`localStorage: neon-watch:filter-views`）。
- 筛选状态写入 hash 查询段（`#/hotspots?sort=recommended&importance=urgent,high`），刷新、前进后退与分享均可还原。
- 点击卡片上的 `#关键词` 标签可直接把该词加入筛选。

---

## 9. AI 研判设计

**输入**：标题、来源、作者、发布时间、互动量、链接、摘要、监控范围。

**输出 Schema（strict）**：

```json
{
  "isReal": true,
  "relevance": 0,
  "importance": "low | medium | high | urgent",
  "summary": "50 字以内中文事实摘要",
  "reason": "一句话真假判断依据"
}
```

**降级链**：主模型 → 备用模型 → 启发式兜底（`ai_status=heuristic`，`ai_model=heuristic-v1`，原因写入 `ai_reason`）。未配置 Key 时直接启发式，并在 UI 中标注，避免把规则结果冒充 AI。

**启发式规则**：标题党词（震惊/网传/据说…）计数、URL 缺失、摘要过短判为存疑；相关度按监控范围词命中与摘要长度估算；重要度按互动量与相关度分档。

**并发**：批量研判 3 并发，单条失败不影响其他条目。

---

## 10. 数据源实现

> v1.5 起默认源为 HN + 4 个国内科技媒体 RSS + 百度资讯；Bing / arXiv / GDELT 代码保留但默认关闭，原因见各小节与 ADR-20。

### 10.1 Bing 网页搜索（默认关闭）

- URL：`https://www.bing.com/search?q=...&count=...&setlang=zh-hans&setmkt=zh-CN&mkt=zh-CN&cc=CN`
- 关键点：必须携带 `mkt/setmkt=zh-CN`，否则区域会返回导航页（官网/应用商店）而非新闻结果。
- 解析：`li.b_algo` → `h2 a`（标题/链接）、`.b_caption p`（摘要）、`.news_dt`（日期）。
- 过滤：跳过官网首页、应用商店、百科等导航型结果；日期支持 `2026-09-11`、`2026年9月11日`、`1 天前`、`昨天` 等写法并统一为 ISO。
- 反爬：4 组 UA 轮换、`Accept-Language`、15s 超时、失败重试 1 次、关键词间 6s 间隔（不低于 3s）。
- 拦截识别：命中验证码/异常流量文案直接抛错并记录到 `runs.error`。

### 10.2 Twitter / X

- `GET /twitter/tweet/advanced_search?query=...&queryType=Top`，Header `X-API-Key`。
- `query` 由关键词 + 范围限定 + `-filter:retweets` 组成。
- 热度值 = 点赞 + 转发×2 + 回复 + 引用，用于后续重要度判断。
- 未配置 Key 时整源跳过并记录，不影响主流程。

### 10.3 Hacker News（Algolia）

- `GET https://hn.algolia.com/api/v1/search_by_date?query=...&tags=story&numericFilters=created_at_i>...`
- 只取 48 小时内的帖子；`points + comments×2` 作为热度；无外链的 Ask/Show HN 回落到讨论页。
- **质量门槛**：`points ≥ 5` 或 `comments ≥ 2`（可配）才入库；关键词必须出现在标题或 URL。
- 无需 Key，实测延迟 1–2s，是开发者圈最快的公开信号源之一。

### 10.4 arXiv（默认关闭）

- `GET https://export.arxiv.org/api/query?search_query=all:<term>&sortBy=submittedDate&max_results=N`
- 实测问题：`OpenAI` 会被拆成 `open` + `ai` 模糊匹配，返回数学/物理/机器人论文；即使 `ti:"OpenAI"` 仍混入数学论文。
- 结论：与“新闻/热点”场景不匹配，默认 `ENABLE_ARXIV=false`；代码保留。

### 10.5 GDELT DOC 2.0（默认关闭）

- `GET https://api.gdeltproject.org/api/v2/doc/doc?query=<term>&mode=artlist&timespan=2d&format=json`
- 实测问题：免费接口按 IP 限流，10 秒串行 + 12 秒重试仍频繁返回 429。
- 结论：默认 `ENABLE_GDELT=false`；代码保留，域名白/黑名单逻辑可用。

### 10.6 HuggingFace（可选，默认关闭）

- `GET https://huggingface.co/api/models?search=<term>&sort=lastModified&direction=-1`
- 用于捕捉模型上新；部分网络不可达，默认 `ENABLE_HF=false`，可访问时再打开。

### 10.7 国内科技媒体 RSS

- 源：IT之家 `ithome.com/rss/`、Solidot `solidot.org/index.rss`、InfoQ 中国 `infoq.cn/feed`、量子位 `qbitai.com/feed`。
- 解析：RSS 2.0 / Atom 均支持；统一 `pubDate/published` 为 ISO。
- 过滤：标题或摘要命中关键词（英文词边界、中文子串）；48h 时效；每源每词最多 8 条。
- 缓存：同一轮多个关键词共享 5 分钟 feed 缓存，减少请求。
- 失败隔离：单源失败只记录 `runs.error`，不影响其他源。

### 10.8 百度资讯

- `GET https://news.baidu.com/ns?word=<term>&tn=news&from=news&cl=2&rn=20&ct=1`
- 解析：优先读取结果节点内的 `s-data` JSON（`title/titleUrl/summary/sourceName/dispTime`），DOM class 仅作兜底。
- 白名单：只保留 IT之家/36氪/机器之心/量子位/InfoQ/财联社/界面/金融界/华尔街见闻等媒体；百家号与未知来源丢弃。
- 时间：支持“7小时前 / 昨天08:13 / 3天前 / 2026-11-11”，超过 48h 丢弃。
- 反爬：3 组 UA 轮换、20s 超时、失败重试一次；命中验证码或异常页面直接跳过。
- 注意：百度链接常为 `baijiahao`，但等级按解析出的**原媒体名**判定，不按链接域名。

### 10.9 时效过滤

入库前统一检查 `publishedAt`：新闻类 48 小时（RSS / 百度 / HN）；超时条目计入 `summary.stale` 并丢弃。搜索类结果没有可解析发布时间时直接丢弃；无时间条目不会进入默认「仅有发布时间」视图。

---

## 11. 去重策略

1. **URL 指纹**：去掉 `utm_* / ref / spm` 等跟踪参数、fragment、末尾斜杠、`www.`，参数排序后 SHA-256，取前 32 位作为唯一指纹。
2. **标题相似度**：中文按字符二元组计算 Dice 系数，与近 48 小时标题比较，≥ 0.86 视为重复（缓存 60s，写入后失效）。
3. 两条规则命中任一即丢弃，避免同一事件被多家转载刷屏。

---

## 12. 调度与任务生命周期

- tick 间隔 30s，读取 `settings.collectInterval`（默认 30 分钟，可调 5–1440）。
- 一轮采集：加锁 → 读取启用关键词（上限 10）→ HN + RSS + 百度抓取 → 关键词守卫 → 时效过滤 → 去重 → 单源入库上限（10）→ 质量分排序 + round-robin（单源 ≤40%）→ AI 研判（上限 12）→ 推送/通知 → 写 `runs` → 广播统计。
- 无新增时用剩余额度补研判 `pending` 积压，避免队列长期堆积。
- 每日首次 tick 触发历史清理：删除超过保留天数且已通知的热点、旧通知与旧任务记录。

---

## 13. 通知设计

- 阈值：`low / medium / high / urgent`，默认 `medium`。
- 通道：浏览器（WS 广播）与邮件（SMTP）独立开关；邮件需配置 SMTP 与收件人。
- 去重：同一条热点 `notified=1` 后不再重复通知。
- 邮件：深色 HTML 模板，包含等级、相关性、来源、摘要与原文按钮；QQ 邮箱需使用授权码（465/SSL）。
- 所有发送结果写入 `notifications`（`sent/failed`），设置页展示最近记录。

---

## 14. 前端设计

**视觉语言（v2 · SIGNAL DESK）**：墨色底 + 信号橙 `#ff5c1a` / 酸性绿 `#c6ff3d` / 琥珀 `#ffb020` / 告警红 `#ff3b5c`，像新闻编辑部的告警台。顶部指挥栏 + 信号走马灯 + 编辑部式大标题 + 聚光灯卡片；字体 Space Grotesk（标题）+ JetBrains Mono（数据）。

**Aceternity UI 组件**（通过 Context7 获取官方实现后落地，按品牌色改造）：
- Spotlight：Hero 顶部锥形光。
- Background Beams：Hero 背景流光 SVG（路径数精简到 18，尊重 `prefers-reduced-motion`）。
- Text Generate Effect：主标题逐字浮现（中文按字符切分）。
- Card Spotlight：热点卡片鼠标跟随光斑。
- Hover Border Gradient：顶栏 SCAN NOW 按钮的流动边框。

**信息架构**：
- 指挥台：大标题 Hero + 实时新增 + 优先队列 + 指标条 + 7 日曲线 + 可信度仪表 + 来源环图 + 实时流 + 系统状态。
- 热点流：等级/来源/可信度/文本四维筛选，编辑部式卡片流，详情抽屉（相关性、判定依据、原文）。
- 关键词：终端风格录入、逐行启停/编辑/删除/单词扫描。
- 设置：通知渠道、采集策略、AI 引擎与能力矩阵、通知历史。

**响应式**：≥1240 桌面双栏 Hero + 三栏 Bento；≤1040 Hero 单栏、指标条 3 列；≤880 顶栏导航收起、底部固定导航；≤560 进一步压缩。支持 `prefers-reduced-motion`。

**可读性与可访问性基线（v1.4）**

| 维度 | 落地方式 |
| --- | --- |
| 对比度 | `--dim` 由 `#616b78` 调整为 `#7c8796`，正文最低 5.23:1（面板）/ 5.47:1（页面底），全部 ≥ WCAG AA 4.5:1 |
| 字号 | 微标签下限 9.5–10.5px，卡片摘要 12.5px，中文标题放宽行高、收紧过度负字距 |
| 触控 | 移动端主按钮 44px、筛选 chip 38px、图标按钮 40px、搜索框 44px；桌面端保留紧凑尺寸 |
| 键盘 | 全局 `:focus-visible` 荧光绿描边；走马灯 `role="region"` + `tabIndex`，聚焦即暂停 |
| 动效 | 走马灯/光斑在 `prefers-reduced-motion` 下切静态；不依赖 hover 传达操作入口（触屏常显） |
| 数据呈现 | 实时数字使用 `tabular-nums`，刷新不抖动；环图中心文案与真实含义一致（SIGNALS） |

**性能**：JS 461.84KB（gzip 150.19KB）、CSS 63.46KB（gzip 13.70KB）；粒子 Canvas 已移除，Beams 仅首页 Hero 使用；动效均可用系统「减少动态」关闭。

---

## 15. Agent Skill

- 位置：`.trae/skills/neon-watch/`，标准 `SKILL.md` + `scripts/watch.mjs`。
- 命令：`stats / hotspots / get / search / analyze / keywords / add-keyword / toggle-keyword / delete-keyword / collect / pending / notifications / health`。
- 输出统一 JSON，便于 Agent 解析；`WATCH_API` 可指向远端实例。
- 约束：先查后抓；实时抓取需用户明确要求；`isReal=false` 与 `heuristic` 必须标注；禁止编造数据。

---

## 16. 安全与运维

- 所有密钥仅存 `.env`（已加入 `.gitignore`），接口只返回布尔能力标记，不返回任何密钥明文。
- 输入校验：关键词长度、邮箱格式、枚举值、分页上限。
- 频控：请求间隔下限 3s、关键词每轮上限 10、单次抓取上限 8 条/源。
- SQL 全部参数化；只有白名单设置键可写。
- 运行：`npm start` 单端口；`server/data/hotmonitor.db` 为唯一状态文件，备份该文件即可。

---

## 17. 测试与验收结果

| 类型 | 内容 | 结果 |
| --- | --- | --- |
| 单元 | URL 归一化、指纹一致性、标题相似度、关键词守卫、HN 门槛、RSS/百度解析、配额 | 26/26 通过 |
| API | 健康、统计、热点分页、关键词 CRUD/409、设置校验、通知、密钥不外泄 | 13/13 通过 |
| 集成 | 隔离库真实采集（HN + RSS + 百度）、去重、AI 批量研判、WS 推送、邮件发送 | 通过；9 条入库来自 4 个源，无 arXiv/GDELT/Bing |
| 前端 | 四页渲染、筛选、抽屉、ESC 关闭、移动端布局、无 console 错误 | 通过 |
| 视觉/可访问性 | 1440 与 390 宽四页截图；无横向溢出；对比度 ≥5.2:1；焦点环、触控尺寸、减弱动效 | 通过 |
| 邮件 | QQ SMTP 自检 + 热点命中自动发送（浏览器+邮件双通道） | 通过，收件方已确认 |
| AI | DeepSeek 主模型结构化输出、备用模型配置 | 通过 |
| Skill | CLI 各命令与真实 API 联调 | 通过 |

`npm test` 可重复执行；`RUN_COLLECT=1 npm test` 会额外跑一轮真实采集。

---

## 18. 已知限制与后续

1. **模型区域限制**：OpenAI/Anthropic/Gemini 在当前区域 403，已切换 DeepSeek/Kimi；更换网络环境后可直接改 `.env` 恢复。
2. **来源覆盖仍有限**：默认只有 HN + 4 个 RSS + 百度资讯；安静时段可能条数偏少，但不再用 arXiv/GDELT 噪音填充。百度资讯依赖页面结构，触发验证码时会短暂缺失。
3. **百度白名单需要维护**：媒体名来自百度结果，新增/改名时可能漏收；可在 `.env` 覆盖 `BAIDU_MEDIA_WHITELIST`。
4. **Twitter 未联调**：代码与最新文档一致，但缺 `TWITTERAPI_KEY`，尚未真实取数。
5. **单进程单实例**：当前面向个人使用；多实例部署需把调度与 WS 改为外部协调（如 Redis）。
6. **AI 事实核验边界**：模型无实时检索能力，真假判断基于来源与文本特征，不能替代人工核实。

---

## 19. 变更记录

| 日期 | 版本 | 变更 |
| --- | --- | --- |
| 2026-11-11 | v1.0 | 完成需求分析与方案设计；实现后端、前端、Agent Skill；接入 OpenRouter 与 QQ SMTP；通过测试与验收 |
| 2026-11-11 | v1.1 | 依据 MCP 最新文档将 `X-Title` 改为 `X-OpenRouter-Title`，结构化输出由 `json_object` 升级为 `json_schema + strict`；实测 `require_parameters` 会跳过 DeepSeek 端点故未启用；Bing 增加 `mkt=zh-CN` |
| 2026-11-12 | v1.2 | 前端改版为 SIGNAL DESK：墨色 + 信号橙/酸性绿、顶部指挥栏与信号走马灯、Hero 聚光灯与光束；引入 Tailwind CSS 4 + Aceternity UI + Motion（Context7 核对官方实现） |
| 2026-11-12 | v1.3 | 解决“抓取内容陈旧”：接入 HN/arXiv/GDELT/HuggingFace，统一发布时间并做 48h 时效过滤；默认按发布时间排序，新增「仅有发布时间」筛选；去重窗口 7 天→48 小时；Bing 过滤导航型结果 |
| 2026-11-12 | v1.4 | 可读性与可访问性打磨：对比度基线（--dim 3.67→5.47:1）、微标签字号下限、移动端触控尺寸、键盘焦点环、走马灯可聚焦暂停、触屏常显操作入口；环图中心文案修正为 SIGNALS |
| 2026-11-12 | v1.5 | 来源可靠性 v2：关闭 Bing/arXiv/GDELT；新增百度资讯（白名单媒体）与 4 个国内科技媒体 RSS；加入关键词守卫、HN 5/2 门槛、单源入库上限与 AI 40% 配额 |
| 2026-11-12 | v1.6 | 检索能力升级：新增 7 种排序（含综合推荐分）、等级/来源/状态多选、相关度与热度门槛、时间窗口与自定义区间、筛选抽屉、预设与自定义视图、URL 状态同步；新增 `relevance/engagement/published_at` 索引 |
