---
name: hotspot-intel
description: NEON//WATCH 热点情报的组合能力。当用户说「今天有什么值得写的」「帮我出个热点简报/早报」「这条能写吗 / 是不是真的」「哪些监控词该换了」「某个词最近怎么样」时使用。提供 brief（简报）、verify（选题前核实）、audit（监控词体检）三个组合命令，以及热点查询、关键词维护、手动采集等基础命令。
---

# NEON//WATCH · hotspot-intel

把「发现 → 判断 → 开写」压成几条命令。所有数据都来自本地监控服务（真实抓取 + AI 研判），**禁止编造热点、链接、时间或分数**。

## 运行前提

- 后端服务需已启动，默认 `http://localhost:8787`；远端实例用 `WATCH_API=http://host:8787` 覆盖。
- 命令统一为 `node scripts/intel.mjs <command> [args]`，默认输出 JSON；`brief` 加 `--md` 输出可直接粘贴的 markdown。
- 零第三方依赖，Node ≥ 18 即可（依赖内置 `fetch`）。

## 与其它 skill 的关系

若同时安装了基础的 `neon-watch`，**优先使用本 skill**：本 skill 覆盖它全部命令，并额外提供 brief / verify / audit。两者并存不冲突。

## 先看这三条

| 用户意图 | 命令 | 说明 |
| --- | --- | --- |
| 现在有什么值得写 | `brief --hours 24 --limit 5` | 汇总窗口内的高价值信号、存疑条目、各监控词产出；`--md` 出 markdown |
| 这条能不能写 | `verify <id>` / `verify --q <标题>` / `verify --url <链接>` | 库内同事件交叉 + 来源数 + AI 判定 → `confidence: high/medium/low` |
| 监控词该不该调整 | `audit` | 每个词的 7 天产出、平均相关度、待研判 + 健康标签 + 重复词对 |

判定口径（置信度规则、标签阈值、相似度阈值）见 [references/scoring.md](./references/scoring.md)。

## 其余命令

| 场景 | 命令 |
| --- | --- |
| 总览统计 | `stats` |
| 最新/推荐信号 | `hotspots --hours 48 --sort recommended --limit 10` |
| 高相关度选题 | `hotspots --relevance-min 80 --hours 24` |
| 某个监控词的全部信号 | `hotspots --keyword "Claude Code" --hours 48` |
| 文本检索（多词 / 排除 / 短语） | `hotspots --q "deepseek -股价"` |
| 待研判积压 | `hotspots --status pending,failed --sort pending` |
| 单条详情 | `get <id>` |
| 关键词列表 | `keywords` |
| 通知历史 | `notifications --limit 10` |
| 健康检查 | `health` |

完整参数与 JSON 结构见 [references/commands.md](./references/commands.md)。

## 写操作（执行前必须先向用户确认）

`search`、`collect`、`analyze`、`add-keyword`、`toggle-keyword`、`delete-keyword`、`pending` 会触发真实网络请求、AI 计费或修改配置。**必须先说明将要发生的动作并取得用户同意**，不要在用户只是询问时擅自执行。

## 硬约束

1. 回答热点必须带 `title`、`source`、发布时间与 `url`，不要改写标题含义。
2. `isReal=false` → 明确标注「AI 判定存疑」；`isReal=null` → 「未研判」。
3. `aiStatus=heuristic` → 标注「启发式判定，未调用大模型」；`pending/failed` → 说明未完成研判。
4. `source=seed` → 标注「演示数据」。
5. 接口返回 ISO（UTC）时间，展示给用户时用本地时间；`publishedAgo` 已是相对时间，可直接引用。
6. 命令返回 `{"error": ...}` 时如实告知服务不可用或参数错误，不要用猜测内容填补。
7. 结果为空时给出下一步建议（放宽窗口 / 换关键词 / 触发采集），不要编造数据。

## 参考文档

- [references/commands.md](./references/commands.md) —— 全量命令、参数、返回结构
- [references/workflows.md](./references/workflows.md) —— 5 条典型工作流（含命令序列）
- [references/scoring.md](./references/scoring.md) —— 评分与阈值口径、已知局限
