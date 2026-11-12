---
name: neon-watch
description: 查询与操作 NEON//WATCH AI 热点监控中枢。当用户询问“最近有什么 AI 热点”“某个关键词有什么新动态”“帮我加/停监控词”“这条消息是真的吗（真假识别）”“看看通知记录/采集状态”时使用。支持热点检索、关键词管理、AI 研判、手动抓取与统计。
---

# NEON//WATCH 热点监控 Skill

本 Skill 通过本地 HTTP API 读取真实抓取与 AI 研判结果。**所有数据必须来自命令输出，禁止自行编造热点、链接或时间。**

## 运行前提

- 后端服务需已启动，默认地址 `http://localhost:8787`。
- 如部署在其他地址，设置环境变量 `WATCH_API`（例如 `http://192.168.1.10:8787`）。
- 命令统一通过 `node scripts/watch.mjs <command> [args]` 执行，输出为 JSON。
- 若结果中 `source` 为 `seed`，表示本地演示数据，回答时需明确标注「演示数据」。

## 命令清单

| 场景 | 命令 |
| --- | --- |
| 总览统计 | `node scripts/watch.mjs stats` |
| 最新热点（默认 10 条） | `node scripts/watch.mjs hotspots --limit 10` |
| 按等级筛选 | `node scripts/watch.mjs hotspots --importance urgent --days 2` |
| 关键词检索已有热点 | `node scripts/watch.mjs hotspots --q DeepSeek` |
| 查看单条详情 | `node scripts/watch.mjs get 42` |
| 实时抓取新热点（较慢，10-60s） | `node scripts/watch.mjs search "DeepSeek V4" --domain 大模型` |
| AI 研判单条 | `node scripts/watch.mjs analyze 42` |
| 查看监控词 | `node scripts/watch.mjs keywords` |
| 新增监控词 | `node scripts/watch.mjs add-keyword "Claude Code" --domain AI编程` |
| 启用/停用监控词 | `node scripts/watch.mjs toggle-keyword 3 off` |
| 删除监控词 | `node scripts/watch.mjs delete-keyword 3` |
| 触发一轮全量采集 | `node scripts/watch.mjs collect` |
| 补研判待处理条目 | `node scripts/watch.mjs pending --limit 5` |
| 通知历史 | `node scripts/watch.mjs notifications --limit 10` |

## 使用原则

1. **先查后抓**：用户只是问“有什么热点”时用 `stats` / `hotspots`，不要直接 `collect` 或 `search`。
2. **实时抓取需谨慎**：`search` / `collect` 会触发真实网络请求与 AI 调用，只在用户明确要求“现在去抓/搜一下”时使用。
3. **可信度必须说明**：输出中若 `isReal=false` 标注「AI 判定存疑」；若 `aiStatus=heuristic` 标注「启发式判定，未调用大模型」。
4. **引用原文**：回答热点时必须带上 `title`、`source`、`createdAt` 与 `url`，不要改写标题含义。
5. **时间**：接口返回 ISO 时间（UTC），展示给用户时转换为本地时间。
6. **错误处理**：若命令返回 `{"error": ...}`，如实告知用户服务不可用或参数错误，不要用猜测内容替代。

## 示例工作流

用户问：「最近 AI 编程领域有什么值得写的新热点？」

1. `node scripts/watch.mjs hotspots --importance high --days 2 --limit 10`
2. 读取返回的 `items`，按 `importance` 与 `relevance` 排序说明。
3. 对 `isReal=false` 的条目单独提示「存疑，不建议作为选题」。
4. 若结果为空，建议用户执行 `collect` 或补充监控词。
