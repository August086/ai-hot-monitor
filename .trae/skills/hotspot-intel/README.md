# hotspot-intel

把 NEON//WATCH 的能力封装成一个可移植的 Agent Skill：一条命令出简报、核实选题、体检监控词。

- 零第三方依赖，只要 Node ≥ 18（用内置 `fetch`）
- 只通过 HTTP 访问监控服务，不 import 任何服务端代码
- 整个 `hotspot-intel/` 目录可直接复制到别的 agent 使用

## 目录

```
hotspot-intel/
  SKILL.md                 # 路由表 + 硬约束（agent 首先读它）
  references/
    commands.md            # 全量命令、参数、返回结构
    workflows.md           # 5 条工作流与表达要点
    scoring.md             # 评分口径、阈值、已知局限
  scripts/intel.mjs        # CLI（唯一可执行文件）
```

## 使用

```bash
# 需要监控服务已启动
export WATCH_API=http://localhost:8787      # Windows: $env:WATCH_API="http://localhost:8787"

node scripts/intel.mjs brief --hours 24 --limit 5
node scripts/intel.mjs brief --hours 48 --md          # 直接出 markdown
node scripts/intel.mjs verify 159                      # 选题前核实
node scripts/intel.mjs verify --q "DeepSeek 限额" --same-event 0.3
node scripts/intel.mjs audit                           # 监控词体检
node scripts/intel.mjs hotspots --hours 48 --sort recommended --limit 10
node scripts/intel.mjs --help
```

## 装到其它 agent

| 目标 | 做法 |
| --- | --- |
| Trae | 复制到 `.trae/skills/hotspot-intel/`（本仓库已同步一份） |
| Claude Code | 复制到 `.claude/skills/hotspot-intel/` |
| Cursor / 其它 | 放到其 skills 目录，或在项目规则里指向 `SKILL.md` |

本仓库的同步方式（在项目根执行）：

```bash
node skills/sync.mjs            # skills/hotspot-intel → .trae/skills/hotspot-intel
node skills/sync.mjs --check    # 只比对，不一致时退出码 1
```

两份内容必须一致；改完 `skills/hotspot-intel` 后跑一次同步即可。

## 设计取舍

- **组合优于薄封装**：`brief` / `verify` / `audit` 都是「多次接口调用 + 本地计算」，这是 agent 自己做不好或做不稳的部分；单个接口的封装价值有限。
- **输出 JSON 优先**：便于 agent 解析；只有 `brief --md` 输出 markdown，因为它的最终形态就是给人读的简报。
- **阈值显式化**：同事件相似度默认 0.62（保守），可用 `--same-event` 调整；调参建议与局限写在 `references/scoring.md`。
- **不碰项目代码**：不修改 server / web / package.json，也不修改既有的 `neon-watch` skill。
