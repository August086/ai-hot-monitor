# 技术选型说明（ADR）

| 项目 | 内容 |
| --- | --- |
| 版本 | v1.1 |
| 日期 | 2026-11-12 |
| 关联文档 | [需求文档](./REQUIREMENTS.md) · [方案设计](./SOLUTION.md) |
| 适用范围 | 单机、个人使用、7x24 运行的 AI 热点监控工具 |

本文记录**每项技术为什么被选中、放弃了哪些备选、付出了什么代价、什么情况下应该重选**。结论优先，论证从简。

---

## 0. 选型总原则

1. **单机可跑**：一条 `npm start` 启动，不引入外部中间件。
2. **少依赖**：能用标准库就不引第三方，能用原生实现就不引框架封装。
3. **可替换**：抓取、AI、通知都做成独立 service，换实现不影响其他模块。
4. **可验证**：接口写法以官方文档为准（MCP 抓取校验），不凭记忆。
5. **够用即止**：个人工具不为假设的规模化提前设计。

---

## 1. 版本基线

| 依赖 | 版本 | 说明 |
| --- | --- | --- |
| Node.js | 24.21 LTS | 提供稳定 `node:sqlite` |
| Express | 5.1 | async 路由错误可直接传递 |
| ws | 8.18 | 原生 WebSocket 服务端 |
| cheerio | 1.1 | 服务端 HTML 解析 |
| nodemailer | 7.0 | SMTP 发信 |
| React / ReactDOM | 19.2 | 并发渲染 |
| Vite | 7.1 | 开发与构建 |
| TypeScript | 5.9 | 前端类型约束 |
| Tailwind CSS | 4.x | 仅组件层工具类，关闭 preflight |
| Aceternity UI | 源码级引入 | Spotlight / Beams / Card Spotlight 等 |
| Motion | 12.x | 动效运行时（`motion/react`） |
| SQLite | 内置（node:sqlite） | WAL 模式 |

---

## 2. 关键决策

### ADR-01 运行时：Node.js 24 + 内置 `node:sqlite`

- **选择**：Node 24 原生 `DatabaseSync`，不引入 ORM。
- **备选**：`better-sqlite3`（更快但需原生编译）；Prisma（功能全但需 generate/migrate、体积大）；Postgres（能力强但需额外服务）。
- **理由**：个人工具数据量小；Windows 环境下原生编译是主要故障源；零 ORM 让 SQL 与表结构一目了然。
- **代价**：无迁移工具，表结构变更需手写 `ALTER`；无类型推导。
- **重选条件**：需要多实例写入、复杂迁移或多表关联分析时，换 Postgres + Drizzle。

### ADR-02 Web 框架：Express 5

- **选择**：Express 5。
- **备选**：Fastify（性能更好、schema 校验强）；Koa（更轻）；NestJS（工程化强但重）。
- **理由**：路由与中间件模型最简单；5.x 已支持 async 错误自动进入错误处理；团队/个人心智负担最低。
- **代价**：吞吐不如 Fastify；无内置 schema 校验（用路由层手写白名单校验）。
- **重选条件**：QPS 上万或需要 OpenAPI 自动生成时，换 Fastify。

### ADR-03 存储：SQLite（WAL）

- **选择**：单文件 SQLite，开启 WAL。
- **备选**：Postgres、MySQL、Redis（仅缓存）、JSON 文件。
- **理由**：单进程读写、数据量万级；备份就是复制一个文件；WAL 让读写并发不互相阻塞。
- **代价**：不适合多实例并发写；没有 TTL/缓存能力。
- **重选条件**：多实例部署或需要队列/缓存时，补 Redis；数据服务化时换 Postgres。

### ADR-04 实时通道：原生 `ws`

- **选择**：`ws` + 自定义事件协议，心跳 30s。
- **备选**：Socket.IO（自动重连/降级，但包体大、协议黑盒）；SSE（单向够用，但无法客户端订阅）。
- **理由**：需求只有服务端广播 + 少量客户端订阅消息；`ws` 体积小、行为可控，重连逻辑在前端 30 行可读代码内。
- **代价**：需自行实现重连、心跳、订阅过滤。
- **重选条件**：需要房间、消息确认、跨端降级时换 Socket.IO。

### ADR-05 调度：自研 tick 调度

- **选择**：30 秒 tick + 比较 `settings.collectInterval`，采集互斥锁。
- **备选**：`node-cron`（表达式直观，但改间隔需重建任务）；`node-schedule`；BullMQ（需 Redis）。
- **理由**：间隔需要从设置页热更新；tick 方案改库即生效，且天然支持「启动后不立即跑」与日切清理。
- **代价**：精度为 30 秒级，不适合秒级任务。
- **重选条件**：需要精确到秒或多任务编排时换 node-cron/BullMQ。

### ADR-06 前端：React 19 + Vite 7 + TypeScript

- **选择**：SPA，hash 路由，无状态库。
- **备选**：Next.js（SSR 对本项目无价值，反而增加服务端复杂度）；原生 JS（状态管理手写易乱）；Vue（同样可行，团队偏好 React）。
- **理由**：四个页面、数据以轮询 + WS 为主；Vite 冷启动与构建都在秒级；TS 约束 API 返回结构。
- **代价**：无 SEO（内部工具不需要）；hash 路由不优雅但免依赖。
- **重选条件**：需要公开分享页面或 SSR 时换 Next.js/Remix。

### ADR-07 样式：手写设计系统 + Tailwind 工具类（混合）

- **选择**：页面骨架与视觉令牌用手写 CSS（`styles.css` + `styles-v2.css`）；Aceternity 组件内部使用 Tailwind CSS 4 工具类，仅引入 `theme` 与 `utilities` 两层，关闭 preflight 以免破坏既有样式。
- **备选**：纯 Tailwind（开发快但独特视觉难做）；shadcn/ui（成品感强、同质化）；SCSS（多一层构建）；纯手写（无法直接复用 Aceternity 源码）。
- **理由**：既要「独特」，又必须使用 Aceternity 组件；混合方案让品牌视觉保持可控，组件效果又能原样落地。关闭 preflight 后，Tailwind 只作用于组件，不污染全局。
- **代价**：两套样式体系并存，需要约定边界（新组件用 Tailwind，页面级布局用 CSS 变量）；CSS 产物增至约 61KB（gzip 13KB）。
- **重选条件**：新页面全部改用 Tailwind 时，可移除手写样式；若视觉要求下降，也可退回纯 Tailwind。

### ADR-07b 动效组件：Aceternity UI + Motion

- **选择**：Spotlight、Background Beams、Card Spotlight、Text Generate Effect、Hover Border Gradient，动画库用 `motion`（`motion/react`）。
- **备选**：纯 CSS 动效（轻但表现力有限）；Framer Motion 原包（与 motion 同源，新项目推荐 motion）；GSAP（能力强但体积与学习成本高）。
- **理由**：需求明确要求 Aceternity；其官方实现基于 React + Tailwind + Motion，组件可复制后按品牌色改造；只在首屏 Hero 与卡片悬停使用，避免全站动画。
- **代价**：JS 产物从 84KB 增至约 150KB（gzip）；Background Beams 为 SVG + 渐变动画，已把路径数从 50+ 降到 18，并尊重 `prefers-reduced-motion`。
- **重选条件**：低端设备或弱网场景，可关闭 Beams/Spotlight，只保留 CSS 光晕与过渡。

### ADR-08 图表：手写 SVG

- **选择**：仪表盘刻度环、7 日曲线、来源环图、重要度条形均为原生 SVG。
- **备选**：ECharts（功能全，包体大、默认风格重）；Recharts（React 友好但增加 ~100KB）；Chart.js。
- **理由**：只需 4 种简单图形；手写可完全匹配霓虹风格与动效，零运行时依赖。
- **代价**：复杂交互（缩放、tooltip）需自己实现。
- **重选条件**：需要时间轴缩放、多轴联动时换 ECharts。

### ADR-09 抓取：fetch + cheerio

- **选择**：HTTP 抓取 + CSS 选择器解析，UA 轮换 + 限速 + 重试。
- **备选**：Playwright/Puppeteer（能跑 JS，但资源占用高、部署重）；官方搜索 API（Bing/Google 均需付费与资质）。
- **理由**：Bing 结果页为服务端渲染，无需浏览器；`cheerio` 轻量；限速与 UA 轮换足以满足个人频率。
- **代价**：页面结构变更会导致解析失效；无 JS 渲染能力。
- **重选条件**：目标站点改为前端渲染或反爬升级时，引入 Playwright。

### ADR-10 AI 接入：OpenRouter 原生 HTTP（不用 SDK）

- **选择**：`fetch` 调 `POST /api/v1/chat/completions`，`response_format: json_schema`。
- **备选**：`@openrouter/sdk`（封装好但增加依赖与版本漂移）；各家官方 SDK（多套鉴权与格式）。
- **理由**：只需一个端点；原生 HTTP 便于按最新文档调整 Header 与结构化输出；失败降级逻辑完全可控。
- **代价**：需自己处理超时、解析、重试。
- **重选条件**：需要流式 UI、工具调用编排时，改用官方 SDK 或 Responses API。

### ADR-11 模型：DeepSeek V4.1 Flash（主）+ Kimi K3（备）

- **选择**：`deepseek/deepseek-v4.1-flash-1017`，备用 `moonshotai/kimi-k3`。
- **备选**：OpenAI GPT / Anthropic Claude / Google Gemini（需求原文首选）。
- **理由**：实测当前出口区域对上述三家全部返回 `403 not available in your region`；DeepSeek 与 Kimi 可用、中文强、成本低、延迟 1–4s。
- **代价**：与需求文档中的「Claude / GPT-4 主模型」不一致，需在文档中明确说明；模型事实核验能力有限。
- **重选条件**：网络区域变化或 OpenRouter 放开限制后，改 `.env` 即可切回，无需改代码。

### ADR-12 邮件：nodemailer + 通用 SMTP

- **选择**：SMTP 直连（QQ 邮箱实测 465/SSL）。
- **备选**：Resend/SendGrid 等邮件 API（送达率好，但需额外账号与域名配置）；系统 `sendmail`（Windows 不可用）。
- **理由**：个人使用只需发给自己；SMTP 通用，换邮箱只改 `.env`。
- **代价**：自建发信易进垃圾箱；QQ 需授权码。
- **重选条件**：需要批量订阅、送达统计或自定义域名时，换 Resend。

### ADR-13 路由：hash 路由

- **选择**：`#/dashboard` 等 hash，`hashchange` 监听。
- **备选**：react-router（功能全，增加依赖）；history API（需服务端 fallback，本项目已支持但无必要）。
- **理由**：四个页面、无嵌套路由、无权限；20 行代码即可。
- **代价**：URL 不够美观；无法做嵌套布局路由。
- **重选条件**：页面数超过 8 个或需要路由守卫时，换 react-router。

### ADR-14 状态管理：组件内 state + 轻量 props

- **选择**：页面自取数据，App 只持有视图、Toast、抽屉、WS 状态。
- **备选**：Redux（重）；Zustand（好用但当前无跨页共享需求）；React Query（缓存/重试强，但增加概念）。
- **理由**：数据天然按页隔离；WS 事件只需触发一次 `pulse` 让页面重取。
- **代价**：重复请求略多（20s 轮询）；跨页状态同步靠重新拉取。
- **重选条件**：出现跨页共享的复杂缓存时，引入 React Query。

### ADR-15 Agent Skill：CLI + SKILL.md

- **选择**：`.trae/skills/neon-watch/` 下放 `SKILL.md` 与无依赖 `watch.mjs`，通过 HTTP 调本服务。
- **备选**：MCP Server（工具协议标准，但需进程管理与额外依赖）；直接让 AI 读写数据库（危险且耦合）。
- **理由**：Skill 只需给 Agent 一套稳定命令；CLI 同时可供人调试；HTTP 边界保证权限与校验。
- **代价**：需服务在运行；Agent 需执行本地命令。
- **重选条件**：需要被远程 Agent 或 IDE 原生工具面板调用时，再包一层 MCP Server。

### ADR-16 测试：node:assert + 原生 fetch

- **选择**：单文件冒烟测试，覆盖去重单元与 API 契约。
- **备选**：Jest/Vitest（生态好，但需配置与额外依赖）；Playwright（E2E 强，但浏览器体积大）。
- **理由**：核心风险在「接口契约」与「去重逻辑」，脚本化验证成本最低；E2E 用浏览器实测补充。
- **代价**：无覆盖率统计、无并行隔离。
- **重选条件**：逻辑复杂度上升或多人协作时，迁移 Vitest + Playwright。

### ADR-17 资讯源：免密钥多源组合（Bing + HN + arXiv + GDELT）

> 注：v1.5 已按 ADR-20 调整具体来源；本条保留为历史决策记录，多源原则仍成立。

- **选择**：Bing 网页搜索 + Hacker News（Algolia）+ arXiv（Atom）+ GDELT DOC 2.0，HuggingFace 可选、X 按需接入。
- **备选**：官方 RSS / 博客订阅（覆盖窄、更新慢、常青页多）；Bing News / Google News API（需资质或付费）；NewsAPI 等付费聚合（配额与中文覆盖受限）；自建爬虫池（维护成本高）。
- **理由**：按信息形态分层——新闻看 Bing/GDELT，开发者讨论看 HN，论文看 arXiv，模型上新看 HF；四类信号互补，且全部免密钥、可并行、单源失败可隔离。这直接回应“只抓官网、内容很老”的问题。
- **代价**：各源字段与时间格式不一致，需要统一归一化；arXiv/GDELT 中文覆盖弱；HF 在部分网络不可达，默认关闭。
- **重选条件**：需要中文资讯深度覆盖时，补垂直站点 RSS 或付费新闻 API；需要秒级信号时，改用官方推送/流式接口。

### ADR-18 时效：采集侧过滤 + 查询侧排序双约束

- **选择**：采集侧按源丢弃超时条目（新闻 48h、arXiv 168h、HF 336h）；查询侧以 `COALESCE(published_at, created_at)` 排序，无发布时间排后，并提供 `dated=true` 只看有时间的条目。
- **备选**：不做过滤（旧闻混杂）；只按入库时间排序（旧文新抓会伪装成新讯）；依赖搜索引擎的相关性排序（不可控）；让 LLM 判断新旧（成本高且不可靠）。
- **理由**：新旧是硬约束，应在数据层解决；不同内容半衰期不同，分源窗口比统一窗口合理；无发布时间条目保留但降权，避免误杀。
- **代价**：可能误杀“旧文更新/长文再热”；Bing 无发布时间的结果需要用户切换开关才能看到。
- **重选条件**：接入发布时间稳定的源后可收紧窗口；需要“再热”检测时，增加互动量二次比较。

### ADR-19 可访问性：WCAG 2.1 AA 作为硬约束

- **选择**：通过设计令牌与覆盖层统一落地——对比度 ≥4.5:1、字号下限、触控尺寸、可见焦点环、`prefers-reduced-motion`、无横向滚动。
- **备选**：全量重构为 Tailwind 设计系统（成本高，且会破坏既有 SIGNAL DESK 视觉）；只做移动端适配（桌面同样受益）；引入 Headless UI/Ariakit（当前交互简单，收益低于依赖成本）。
- **理由**：暗色编辑部风格最容易牺牲可读性（灰字 + 小字 + 自发光），必须在 token 层修正；不引组件库也能用少量 CSS 完成焦点、触控与动效约束。
- **代价**：视觉密度略降（字号与点击区域变大），信息量与可读性需要取平衡。
- **重选条件**：需要多主题、国际化或正式无障碍审计时，迁移到 design token + 组件库方案。

### ADR-20 来源取舍：可靠性优先（关闭 arXiv/GDELT/Bing，新增百度资讯与 RSS）

- **选择**：默认源为 Hacker News + IT之家/Solidot/InfoQ/量子位 RSS + 百度资讯（白名单媒体）；Bing、arXiv、GDELT 代码保留但默认关闭。
- **备选**：arXiv 加 `cat:cs.*` + 标题过滤；GDELT 改单轮合并查询 + 60s 退避；Bing 保留但默认隐藏；接入头条/搜狗/360/Google News；引入付费搜索 API。
- **理由（均为实测）**：
  - arXiv：`all:OpenAI` 被拆成 `open` + `ai`，返回数学/物理/机器人论文；`ti:"OpenAI"` 仍混入数学论文，与热点场景不匹配。
  - GDELT：免费接口按 IP 限流，10 秒串行 + 12 秒重试仍频繁 429，整轮缺失。
  - Bing：库内 62 条结果全部没有发布时间，默认「仅有发布时间」视图下 0 条可见。
  - Google News / DuckDuckGo / Brave：当前网络超时；搜狗反爬；360 结果偏导航/百科；头条结果以视频/标题党为主。
  - 百度资讯：可稳定解析出标题、原媒体名、摘要与相对时间；4 个国内科技媒体 RSS 均可达。
- **配套质量闸门**：关键词守卫（英文词边界 / 中文子串）、HN 5 赞或 2 评论、百度白名单媒体、单源入库 ≤10、AI 单源 ≤40%。
- **代价**：来源数量减少，安静时段条数偏少；百度依赖页面结构且可能触发验证码；白名单需要维护。
- **重选条件**：网络环境变化（Google/Reddit/Brave 可达）、arXiv 提供稳定的分类+相关性过滤、GDELT 配额放宽，或引入付费搜索 API 时，可重新启用对应源。

---

## 3. 明确放弃的选项

| 选项 | 放弃原因 |
| --- | --- |
| Prisma / ORM | 单机小数据量，收益低于构建与迁移成本 |
| Socket.IO | 功能过剩，包体与协议成本高 |
| Tailwind / 组件库 | 与「独特视觉」目标冲突，且同质化 |
| ECharts | 图形简单，包体不划算 |
| Next.js | 无 SEO/SSR 需求，增加部署复杂度 |
| 多模型 SDK 并存 | 统一走 OpenRouter，减少鉴权与格式分支 |
| Redis / 消息队列 | 单进程无队列需求，SQLite 足够 |
| Docker 化 | 个人本机运行，`npm start` 更直接 |
| 厂商官网 RSS 全量订阅 | 覆盖窄、更新慢，多数官网内容属于常青页；改用科技媒体 RSS 做关键词过滤 |
| 付费新闻 / 搜索 API | 个人使用成本高，免密钥组合（HN + RSS + 百度）已足够 |
| 单一 Bing 源 | 结果普遍无发布时间，默认视图下不可见；必须由带时间的源补足 |
| arXiv 全量接入 | 学术检索与新闻不匹配，实测返回大量无关数学/物理论文 |
| GDELT 高频接入 | 免费接口 429 限流，重试仍不可靠 |

---

## 4. 选型的验证方式

- 接口类决策（OpenRouter、twitterapi.io）通过 MCP 抓取官方文档核对，见 [SOLUTION.md](./SOLUTION.md) 第 4 节。
- 性能类决策以实测为准：首屏产物 gzip ≈ 150KB（含动效运行时）；AI 单条研判 0.7–4s；一轮采集（3 词）≈ 14s。
- 时效类决策以真实采集结果为准：48h 窗口下 `runs.found` 与 `summary.stale` 可直接对比，验证“旧闻被拦截”。
- 可访问性以实测为准：对比度用脚本计算（最低 5.23:1），布局在 1440 / 390 两档、四个页面截图核对，确认无横向滚动。
- 来源可靠性以隔离库真实采集为准：默认源一轮入库 9 条来自 4 个源（百度 5 / HN 2 / RSS 2），无 arXiv/GDELT/Bing。
- 每个选型都保留替换点：抓取、AI、通知、存储均在独立模块内，替换不影响其他层。

---

## 5. 变更记录

| 日期 | 变更 |
| --- | --- |
| 2026-11-11 | 初版：记录 16 项关键决策与放弃清单 |
| 2026-11-12 | 前端改版：新增 Tailwind CSS 4 + Aceternity UI + Motion 的混合样式方案（ADR-07 / 07b），更新性能基线 |
| 2026-11-12 | 资讯与质量：新增多源组合（ADR-17）、时效双约束（ADR-18）、可访问性基线（ADR-19）；补充放弃项与验证方式 |
| 2026-11-12 | 来源可靠性 v2：新增 ADR-20；关闭 arXiv/GDELT/Bing，改用 HN + 国内科技媒体 RSS + 百度资讯白名单；同步放弃清单 |
