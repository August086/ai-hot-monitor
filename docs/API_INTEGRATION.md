# 第三方接口对接说明

> 本文记录**实际实现**使用的接口写法。所有结论于 2026-11-11 通过 MCP 抓取官方文档核对，代码位置：`server/src/services/`。

## 1. OpenRouter（AI 研判）

**端点**：`POST https://openrouter.ai/api/v1/chat/completions`

**Header**

```http
Authorization: Bearer <OPENROUTER_API_KEY>
Content-Type: application/json
HTTP-Referer: http://localhost
X-OpenRouter-Title: NEON WATCH - AI Hotspot Monitor
```

> 注意：应用标题 Header 已从旧写法 `X-Title` 更新为 `X-OpenRouter-Title`。

**请求体（结构化输出）**

```json
{
  "model": "deepseek/deepseek-v4.1-flash-1017",
  "temperature": 0.2,
  "max_tokens": 600,
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "hotspot_analysis",
      "strict": true,
      "schema": {
        "type": "object",
        "properties": {
          "isReal": { "type": "boolean" },
          "relevance": { "type": "integer", "minimum": 0, "maximum": 100 },
          "importance": { "type": "string", "enum": ["low", "medium", "high", "urgent"] },
          "summary": { "type": "string" },
          "reason": { "type": "string" }
        },
        "required": ["isReal", "relevance", "importance", "summary", "reason"],
        "additionalProperties": false
      }
    }
  },
  "messages": [
    { "role": "system", "content": "…热点分析专家 Prompt…" },
    { "role": "user", "content": "标题 / 来源 / 时间 / 摘要 / 链接…" }
  ]
}
```

**要点**

- Chat Completions 的结构化输出用 `json_schema`，`json_object` 已不是推荐写法。
- 官方建议 `provider.require_parameters: true` 只路由到支持结构化输出的端点；但实测该参数会让 DeepSeek 的部分端点被跳过（能力表未声明 `structured_outputs`），因此本项目**未启用**，改为「严格 Schema + 解析失败自动降级」。
- 降级链：主模型 → 备用模型 → 启发式规则（`ai_status=heuristic`，明确标注非大模型结果）。
- 单次超时 45s，批量 3 并发，单条失败不影响其他条目。

**模型可用性（2026-11 实测）**

| 模型 | 结果 |
| --- | --- |
| `openai/*`、`anthropic/*`、`google/*` | 403 `not available in your region` |
| `deepseek/deepseek-v4.1-flash-1017` | 200，约 0.7–4s |
| `deepseek/deepseek-v4-pro-0813` | 200 |
| `moonshotai/kimi-k3` | 200 |
| `z-ai/glm-5.3`、`qwen/qwen3.8-max-0902` | 200 |

---

## 2. twitterapi.io（X 搜索）

**端点**：`GET https://api.twitterapi.io/twitter/tweet/advanced_search`

**Header**：`X-API-Key: <TWITTERAPI_KEY>`

**参数**

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `query` | 是 | 支持 `from:`、`since_time:`、`-filter:retweets` 等运算符 |
| `queryType` | 是 | `Latest` 或 `Top`，默认 `Latest`；本项目用 `Top` 兼顾热度 |
| `cursor` | 否 | 首页传空串，翻页用返回的 `next_cursor` |

**返回**

```json
{
  "tweets": [
    {
      "id": "…",
      "url": "https://x.com/…/status/…",
      "text": "…",
      "createdAt": "Tue Dec 10 07:00:30 +0000 2024",
      "likeCount": 0,
      "retweetCount": 0,
      "replyCount": 0,
      "quoteCount": 0,
      "author": { "userName": "…", "name": "…" }
    }
  ],
  "has_next_page": true,
  "next_cursor": "…"
}
```

**实现映射**：`text` → 标题/摘要；`author.userName` → 作者；热度 = 点赞 + 转发×2 + 回复 + 引用；未配置 Key 时整源跳过并记录原因。

---

## 3. Bing 网页搜索

**URL**

```
https://www.bing.com/search?q=<query>&count=<n>&setlang=zh-hans&setmkt=zh-CN&mkt=zh-CN&cc=CN&form=QBLH
```

**要点**

- 必须带 `mkt=zh-CN&setmkt=zh-CN`，否则区域返回导航页（官网/应用商店）而非资讯。
- 解析 `li.b_algo`：`h2 a` 取标题与链接，`.b_caption p` 取摘要，`.news_dt` 取日期（用正则校验，避免把 attribution 的链接当成日期）。
- 反爬：4 组 UA 轮换、`Accept-Language`、20s 超时、失败重试 1 次、关键词间默认 6s（配置下限 3s）。
- 命中验证码/异常流量页时抛错，错误写入 `runs.error`，不污染数据。

---

## 4. SMTP（邮件通知）

```js
nodemailer.createTransport({
  host: 'smtp.qq.com',
  port: 465,
  secure: true,
  auth: { user: '…', pass: '授权码' },
});
```

- QQ / 163 使用**授权码**而非登录密码；Gmail 用应用专用密码；Outlook 用 587 + `secure=false`。
- 邮件为深色 HTML 模板，含等级、相关性、来源、摘要与原文按钮。
- 发送结果写入 `notifications`，失败不影响浏览器推送。
- 自检接口：`POST /api/settings/test-email`。

---

## 5. 官方文档来源

- OpenRouter API Reference：https://openrouter.ai/docs/api_reference/overview
- OpenRouter Structured Outputs：https://openrouter.ai/docs/guides/features/structured-outputs
- twitterapi.io Advanced Search：https://docs.twitterapi.io/api-reference/endpoint/tweet_advanced_search

以上页面均于 2026-11-11 通过 MCP（Firecrawl）实时抓取核对。
