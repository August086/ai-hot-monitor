# NEON//WATCH · AI 热点监控中枢

自动发现 AI 领域热点、用大模型判断真假与价值、并通过浏览器与邮件第一时间推送的个人情报工具。

## 功能

- **关键词监控**：增删改查、范围限定、启停、单关键词即时扫描
- **多源抓取**：Bing 网页搜索 + twitterapi.io（X），每 30 分钟一轮，可调
- **AI 研判**：OpenRouter 结构化输出，判断真假、相关性、重要度并生成摘要
- **去重**：URL 指纹 + 中文标题相似度双保险
- **实时通知**：WebSocket 浏览器推送 + SMTP 邮件，按等级阈值过滤
- **控制台**：赛博朋克风格仪表盘、热点流、关键词、设置四页，响应式
- **Agent Skill**：可被其他 AI 调用的 `.trae/skills/neon-watch`

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | React 19 + Vite 7 + TypeScript + 手写 CSS/SVG |
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
| [REQUIREMENTS.md](./REQUIREMENTS.md) | 要做什么：功能、非功能、验收标准 |
| [SOLUTION.md](./SOLUTION.md) | 怎么做：架构、数据模型、接口、AI 与通知设计 |
| [TECH_SELECTION.md](./TECH_SELECTION.md) | 为什么：16 项技术决策与放弃清单 |
| [API_INTEGRATION.md](./API_INTEGRATION.md) | 第三方接口的实际对接方式 |
| [LOCAL_SETUP.md](./LOCAL_SETUP.md) | 本地运行指南 |

## 目录结构

```
server/
  src/
    routes/             REST 路由
    services/           采集 / 去重 / AI / 通知
    services/sources/   Bing / Twitter
    db.js  ws.js  scheduler.js  config.js  index.js
  test/smoke.test.js
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
- Bing 结果质量依赖关键词具体度，宽泛词会命中官网/文档页。
- Twitter 数据源代码已就绪，需 `TWITTERAPI_KEY` 才能取数。
