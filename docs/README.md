# NEON//WATCH · AI 热点监控中枢

自动发现 AI 领域热点、用大模型判断真假与价值、并通过浏览器与邮件第一时间推送的个人情报工具。

## 功能

- **关键词监控**：增删改查、范围限定、启停、单关键词即时扫描
- **多源抓取**：Hacker News + 国内科技媒体 RSS（IT之家/Solidot/InfoQ/量子位）+ 百度资讯；Bing/arXiv/GDELT 保留但默认关闭
- **质量闸门**：关键词相关性守卫、HN 5 赞/2 评论门槛、百度白名单媒体、单源入库上限与 AI 40% 配额
- **时效优先**：按发布时间排序，默认只展示有发布时间的条目，48 小时过滤掉陈旧内容
- **AI 研判**：OpenRouter 结构化输出，判断真假、相关性、重要度并生成摘要
- **去重**：URL 指纹 + 中文标题相似度双保险
- **实时通知**：WebSocket 浏览器推送 + SMTP 邮件，按等级阈值过滤
- **控制台**：SIGNAL DESK 编辑部风格仪表盘、热点流、关键词、设置四页，响应式且符合可访问性基线
- **Agent Skill**：可被其他 AI 调用的 `.trae/skills/neon-watch`

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | React 19 + Vite 7 + TypeScript + Tailwind CSS 4 + Aceternity UI + Motion |
| 后端 | Node.js 24 + Express 5 |
| 存储 | SQLite（`node:sqlite`，WAL） |
| 实时 | ws |
| 抓取 | fetch + cheerio |
| AI | OpenRouter Chat Completions（`json_schema`） |
| 邮件 | nodemailer |

选型理由与备选方案见 [TECH_SELECTION.md](./TECH_SELECTION.md)。

## 文档

| 文档 | 内容 |
| --- | --- |
| [REQUIREMENTS.md](./REQUIREMENTS.md) | 要做什么：功能、非功能（含可访问性）、验收标准与结果 |
| [SOLUTION.md](./SOLUTION.md) | 怎么做：架构、数据模型、接口、AI/时效/通知/前端设计 |
| [TECH_SELECTION.md](./TECH_SELECTION.md) | 为什么：19 项技术决策与放弃清单 |
| [API_INTEGRATION.md](./API_INTEGRATION.md) | 第三方接口的实际对接方式 |
| [LOCAL_SETUP.md](./LOCAL_SETUP.md) | 本地运行指南 |

## 目录结构

```
server/
  src/
    routes/             REST 路由
    services/           采集 / 去重 / AI / 通知
    services/sources/   HN / RSS / 百度资讯（Bing / arXiv / GDELT / HF / Twitter 保留）
    db.js  ws.js  scheduler.js  config.js  index.js
  test/                sources.test.js · smoke.test.js
  scripts/seed.js
web/
  src/
    pages/              Dashboard / Hotspots / Keywords / Settings
    components/         Layout / Backdrop / Primitives / Cards / Drawer
    hooks/useLive.ts
    styles.css
.trae/skills/neon-watch/
  SKILL.md
  scripts/watch.mjs
docs/
```

## 快速开始

```bash
# 1. 安装依赖（根目录，npm workspaces）
npm install

# 2. 配置
copy .env.example .env        # Windows
# cp .env.example .env        # macOS / Linux
# 填入 OPENROUTER_API_KEY 等

# 3. 开发（后端 8787 + 前端 5173）
npm run dev

# 4. 生产（构建前端 + 单端口 8787）
npm run build
npm start

# 5. 测试
npm test
npm run seed -w server        # 可选：写入演示数据
```

访问 http://localhost:8787 （生产）或 http://localhost:5173 （开发）。

## 环境变量（最小集）

```ini
PORT=8787
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODEL=deepseek/deepseek-v4.1-flash-1017
OPENROUTER_FALLBACK_MODEL=moonshotai/kimi-k3

# 可选：X 数据源
TWITTERAPI_KEY=

# 可选：邮件通知
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=你的邮箱
SMTP_PASS=授权码
MAIL_TO=接收邮箱
```

密钥只写入 `.env`（已 gitignore），接口与前端只返回布尔能力标记。

## 已知限制

- OpenAI / Anthropic / Gemini 在当前区域被 OpenRouter 以 403 拒绝，默认使用 DeepSeek + Kimi。
- 默认源为 HN + 4 个国内科技媒体 RSS + 百度资讯；安静时段条数可能偏少。
- 百度资讯依赖页面结构，触发验证码时该源会短暂缺失；白名单可在 `.env` 调整。
- arXiv / GDELT / Bing 因相关性、限流、无发布时间等问题默认关闭，可改 `.env` 回滚。
- Twitter 数据源代码已就绪，需 `TWITTERAPI_KEY` 才能取数。
