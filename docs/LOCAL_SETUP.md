# 本地运行指南

从零把 NEON//WATCH 跑起来。全程只需要 Node.js，不需要数据库、Redis 或 Docker。

## 1. 前置要求

| 工具 | 版本 | 检查 |
| --- | --- | --- |
| Node.js | ≥ 22，推荐 24 LTS | `node -v` |
| npm | ≥ 10 | `npm -v` |

> 必须 Node ≥ 22：项目使用内置 `node:sqlite`，低版本会报模块不存在。

## 2. 获取密钥

### 必需：OpenRouter

1. 打开 https://openrouter.ai/ 注册登录
2. 进入 https://openrouter.ai/settings/keys 创建 Key（`sk-or-v1-` 开头）
3. 在 https://openrouter.ai/settings/credits 确认有余额

> 区域限制：OpenAI / Anthropic / Gemini 在部分区域会返回 403。本项目默认使用区域内可用的 DeepSeek V4.1 Flash（主）与 Kimi K3（备）。

### 可选：twitterapi.io

1. 打开 https://twitterapi.io/ 注册
2. 在 Dashboard 获取 API Key
3. 不配置也能正常运行，只是少了 X 数据源

### 可选：SMTP 邮件

- QQ 邮箱：设置 → 账户 → 开启 POP3/SMTP → 生成**授权码**
- 163 邮箱：设置 → POP3/SMTP/IMAP → 开启 → 新增授权密码
- Gmail：需「应用专用密码」
- Outlook：`smtp.office365.com`，端口 587，`SMTP_SECURE=false`

## 3. 安装

```bash
# 进入项目根目录
cd ai-hot-monitor

# 安装全部依赖（npm workspaces 会同时装 server 与 web）
npm install
```

## 4. 配置

```bash
copy .env.example .env     # Windows
cp .env.example .env       # macOS / Linux
```

编辑 `.env`，最小可用配置：

```ini
PORT=8787
OPENROUTER_API_KEY=sk-or-v1-你的key
OPENROUTER_MODEL=deepseek/deepseek-v4.1-flash-1017
OPENROUTER_FALLBACK_MODEL=moonshotai/kimi-k3
```

需要邮件时再补：

```ini
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=你的QQ邮箱
SMTP_PASS=授权码
MAIL_TO=接收通知的邮箱
```

## 5. 启动

开发模式（后端 8787，前端 5173，自动代理 `/api` 与 `/ws`）：

```bash
npm run dev
```

- 页面：http://localhost:5173
- API：http://localhost:8787/api/health

生产模式（构建前端后由后端单端口托管）：

```bash
npm run build
npm start
```

- 页面与 API 同为 http://localhost:8787

## 6. 首次使用

1. 打开「关键词」页，添加具体的关键词（例如 `DeepSeek V4.1`、`Claude Code 更新`）
2. 点击右上角 `RUN SCAN` 手动跑一轮
3. 到「热点流」查看抓取与 AI 研判结果
4. 到「设置」开启邮件通知、填写收件邮箱并点「发送测试」

> 关键词越具体，结果越像新闻；宽泛词（如 `DeepSeek`）容易命中官网与文档页，AI 会判定为低价值。

## 7. 测试与评测

```bash
npm test                    # 34 项单元 + 28 项 API（API 部分需服务已启动）
RUN_COLLECT=1 npm test      # 额外跑一轮真实采集
npm run eval:ai             # AI 研判质量离线评测（不需要启动服务）
npm run seed -w server      # 写入演示数据
```

`npm run eval:ai` 是这轮新增的“主观指标闸门”：用 20 条人工标注样本跑一遍主模型，输出相关度分档命中率、MAE、重要度混淆矩阵、真伪 P/R/F1、Schema 成功率、延迟与稳定性。

```bash
npm run eval:ai -- --model moonshotai/kimi-k3   # 对比备用模型
npm run eval:ai -- --repeat 3                   # 同输入跑 3 次，看稳定性 σ
npm run eval:ai -- --min-band 0.8               # 抬高相关度门槛
```

- 分档命中 < 0.7 / 重要度 < 0.6 / Schema < 0.95 时退出码为 1，可接 CI。
- 未配置 `OPENROUTER_API_KEY` 时会跑启发式基线，只验证流程、不判失败。
- 报告落在 `server/data/eval-report.json`（已被 gitignore），失败样本会逐条打印 id 与期望/实际值。

## 8. 数据与备份

- 数据库：`server/data/hotmonitor.db`（WAL 模式，同目录有 `-wal/-shm`）
- 备份：停止服务后复制该文件即可；恢复时覆盖回去
- 重置：删除 `server/data/*.db*` 后重启

## 9. 常见问题

**Q1：端口被占用**
改 `.env` 的 `PORT`，同时改 `web/vite.config.ts` 里 proxy 的 `http://localhost:8787`。

**Q2：AI 返回 403 `not available in your region`**
当前区域不支持该模型。换成 `deepseek/deepseek-v4.1-flash-1017` 或 `moonshotai/kimi-k3`，只改 `.env` 无需改代码。

**Q3：抓取结果偏官网 / 旧闻**
Bing 已默认关闭（结果普遍没有发布时间）。默认源为 HN + 国内科技媒体 RSS + 百度资讯；如需重新启用 Bing，设 `ENABLE_BING=true` 并使用更具体的关键词或范围限定。

**Q4：百度资讯没有结果 / 触发验证**
百度可能临时返回验证页，日志会记录 `百度资讯触发反爬验证`，下一轮会自动恢复。若持续失败，可降低抓取频率或暂时设 `ENABLE_BAIDU_NEWS=false`。

**Q4b：Bing 提示异常流量（仅在手动开启 Bing 时）**
已做 UA 轮换与重试；仍失败时把 `CRAWL_DELAY_MS` 调大（例如 10000），或降低 `PER_KEYWORD_LIMIT`。

**Q5：邮件发送失败**
- QQ/163 必须用授权码，不是登录密码
- 465 配 `SMTP_SECURE=true`；587 配 `false`
- 设置页点「发送测试」，看返回的错误信息
- 检查垃圾箱，把发件人加入白名单

**Q6：浏览器收不到实时推送**
确认页面右上角显示「链路在线」；公司网络/代理可能拦截 WebSocket，可退回 30 秒轮询（页面本身会定时刷新）。

**Q7：`node:sqlite` 报错**
Node 版本过低，升级到 22+（推荐 24）。

**Q8：改了 `.env` 不生效**
`.env` 只在进程启动时读取，修改后需重启 `npm start` / `npm run dev`。

**Q9：筛选 / 搜索条件“看起来没生效”**
先确认服务是不是旧进程：`curl http://localhost:8787/api/health` 看 `uptime`，数值很大说明还是改动前启动的那个进程，`npm start` 前先结束旧进程。后端对未知参数是静默忽略的，所以旧代码遇到新参数会“什么都不做”，表现就像筛选失效。

**Q10：改了前端却还是旧界面**
静态资源带 hash 文件名但 `index.html` 有 1 小时缓存，直接 F5 可能仍加载旧包，用 **Ctrl+F5** 硬刷新。

**Q11：从关键词页跳过来后，之前设的筛选条件没了**
这是预期行为：跳转会重置为「该词 + 近 48h + 综合推荐」，保证关键词语境干净；需要别的条件就在语境条或筛选抽屉里再叠加。

## 10. 验收路径

| 步骤 | 预期 |
| --- | --- |
| 打开首页 | 仪表盘渲染，右上角「链路在线」 |
| 添加关键词 → RUN SCAN | 热点流出现新卡片，含 AI 摘要与可信度 |
| 点击卡片 | 抽屉展示相关性、重要度、模型名、原文按钮 |
| 设置页发送测试邮件 | 收件箱收到测试邮件 |
| 关键词页点某个词的「信号 N」 | 就地展开该词近 48h 的 5 条；点词名跳转热点流并显示监控词语境条 |
| 热点流搜索框输入 `AI -招聘` | 列表只剩含 AI 且不含“招聘”的条目，命中词高亮并带「命中·标题/摘要/原文」标识 |
| 触发一条 ≥ 中等级热点 | 浏览器弹出通知 + 收到邮件 |
| 再跑一次相同关键词 | 不产生重复条目（去重生效） |
