#!/usr/bin/env node
/**
 * AI 研判离线评测（无需启动服务）
 *
 * 为什么需要它：relevance / importance / isReal 是主观判断，靠人眼逐条核对成本高、
 * 也无法感知“换了模型或改了提示词后是否退化”。本脚本用一份人工标注的分档样本集，
 * 把主观判断固化成可重复的指标，模型或提示词有改动时跑一次即可对比。
 *
 * 用法：
 *   npm run eval:ai                      # 用当前 .env 的主模型跑一遍
 *   npm run eval:ai -- --repeat 3        # 每条跑 3 次，额外输出稳定性
 *   npm run eval:ai -- --model qwen/qwen3.8-max-0902
 *   npm run eval:ai -- --fixture server/test/fixtures/relevance-eval.json --json-only
 *
 * 退出码：模型引擎下任一阈值不达标 → 1（可接 CI）；启发式基线（无 Key）恒为 0。
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(__dirname, '..');
const PROJECT_ROOT = path.resolve(SERVER_ROOT, '..');

const parseArgs = (argv) => {
  const opts = {
    fixture: path.join(SERVER_ROOT, 'test', 'fixtures', 'relevance-eval.json'),
    repeat: 1,
    model: '',
    fallback: '',
    minBand: 0.7,
    minImportance: 0.6,
    minSchema: 0.95,
    out: path.join(SERVER_ROOT, 'data', 'eval-report.json'),
    jsonOnly: false,
    write: true,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => argv[index + 1];
    if (arg === '--fixture') opts.fixture = path.resolve(PROJECT_ROOT, next()), (index += 1);
    else if (arg === '--repeat') opts.repeat = Math.max(1, Number(next()) || 1), (index += 1);
    else if (arg === '--model') opts.model = next(), (index += 1);
    else if (arg === '--fallback') opts.fallback = next(), (index += 1);
    else if (arg === '--min-band') opts.minBand = Number(next()), (index += 1);
    else if (arg === '--min-importance') opts.minImportance = Number(next()), (index += 1);
    else if (arg === '--min-schema') opts.minSchema = Number(next()), (index += 1);
    else if (arg === '--out') opts.out = path.resolve(PROJECT_ROOT, next()), (index += 1);
    else if (arg === '--json-only') opts.jsonOnly = true;
    else if (arg === '--no-write') opts.write = false;
    else if (arg === '--help' || arg === '-h') {
      console.log(
        [
          'AI 研判离线评测',
          '  --fixture <path>      样本文件（默认 server/test/fixtures/relevance-eval.json）',
          '  --repeat <n>          每条重复次数，用于稳定性（默认 1）',
          '  --model <id>          覆盖主模型（等价于临时改 .env 的 OPENROUTER_MODEL）',
          '  --fallback <id>       覆盖备用模型',
          '  --min-band <0-1>      相关度分档命中率下限（默认 0.7）',
          '  --min-importance <0-1> 重要度准确率下限（默认 0.6）',
          '  --min-schema <0-1>    结构化输出成功率下限（默认 0.95）',
          '  --out <path>          报告输出路径（默认 server/data/eval-report.json）',
          '  --json-only           只在控制台输出 JSON',
          '  --no-write            不写报告文件',
        ].join('\n'),
      );
      process.exit(0);
    }
  }
  return opts;
};

const opts = parseArgs(process.argv.slice(2));

// 必须在导入 config 之前覆盖，dotenv 不会覆盖已存在的 process.env
if (opts.model) process.env.OPENROUTER_MODEL = opts.model;
if (opts.fallback) process.env.OPENROUTER_FALLBACK_MODEL = opts.fallback;

const { config } = await import('../src/config.js');
const { analyzeHotspot } = await import('../src/services/ai.js');

const mean = (list) => (list.length ? list.reduce((sum, value) => sum + value, 0) / list.length : 0);
const round = (value, digits = 3) => Number(value.toFixed(digits));
const stddev = (list) => {
  if (list.length < 2) return 0;
  const avg = mean(list);
  return Math.sqrt(mean(list.map((value) => (value - avg) ** 2)));
};
const percentile = (list, ratio) => {
  if (!list.length) return 0;
  const sorted = [...list].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
};

const fixture = JSON.parse(await readFile(opts.fixture, 'utf8'));
const scope = fixture.scope || config.ai.scope;
const cases = fixture.cases || [];
if (!cases.length) {
  console.error(`样本集为空：${opts.fixture}`);
  process.exit(1);
}

const engine = config.ai.apiKey ? 'model' : 'heuristic';
const now = Date.now();

if (!opts.jsonOnly) {
  console.log('\nNEON//WATCH · AI 研判离线评测');
  console.log(`  引擎    ${engine === 'model' ? `模型（${config.ai.model}）` : '启发式（未配置 OPENROUTER_API_KEY）'}`);
  console.log(`  样本    ${cases.length} 条 · 每条重复 ${opts.repeat} 次 · 范围「${scope}」`);
  console.log('  ' + '-'.repeat(64));
}

const details = [];
const latencies = [];
const stability = [];

for (const item of cases) {
  const publishedAt =
    item.ageHours === null || item.ageHours === undefined
      ? null
      : new Date(now - Number(item.ageHours) * 3600_000).toISOString();
  const hotspot = { ...item.hotspot, publishedAt };

  const runs = [];
  for (let attempt = 0; attempt < opts.repeat; attempt += 1) {
    const started = Date.now();
    let analysis = null;
    let error = null;
    try {
      analysis = await analyzeHotspot(hotspot, { scope });
    } catch (caught) {
      error = caught.message;
    }
    const latency = Date.now() - started;
    latencies.push(latency);
    runs.push({ analysis, error, latency });
  }

  const first = runs[0];
  const relevanceValues = runs
    .map((run) => run.analysis?.relevance)
    .filter((value) => typeof value === 'number');
  const spread = stddev(relevanceValues);
  if (opts.repeat > 1) stability.push(spread);

  const expect = item.expect || {};
  const band = Array.isArray(expect.relevanceBand) ? expect.relevanceBand : null;
  const relevance = first.analysis?.relevance ?? null;
  const inBand = band && typeof relevance === 'number' ? relevance >= band[0] && relevance <= band[1] : false;
  const bandCenter = band ? (band[0] + band[1]) / 2 : null;
  const absError = bandCenter !== null && typeof relevance === 'number' ? Math.abs(relevance - bandCenter) : null;
  const importanceOk = expect.importance ? first.analysis?.importance === expect.importance : null;
  const isRealOk = typeof expect.isReal === 'boolean' ? first.analysis?.isReal === expect.isReal : null;
  const summary = first.analysis?.summary || '';
  const summaryOk = summary.length > 0 && summary.length <= 60;

  details.push({
    id: item.id,
    note: item.note || '',
    keyword: item.keyword || '',
    expect,
    actual: first.analysis
      ? {
          isReal: first.analysis.isReal,
          relevance: first.analysis.relevance,
          importance: first.analysis.importance,
          summary,
          aiStatus: first.analysis.aiStatus,
          aiModel: first.analysis.aiModel,
        }
      : null,
    error: first.error,
    checks: { inBand, importanceOk, isRealOk, summaryOk },
    absError,
    stability: round(spread, 2),
    latencyMs: first.latency,
    runs: runs.map((run) => ({ relevance: run.analysis?.relevance ?? null, error: run.error })),
  });
}

// ---------- 指标 ----------
const withBand = details.filter((item) => Array.isArray(item.expect.relevanceBand));
const bandHits = withBand.filter((item) => item.checks.inBand).length;
const bandAccuracy = withBand.length ? bandHits / withBand.length : 0;
const absErrors = details.map((item) => item.absError).filter((value) => typeof value === 'number');
const mae = absErrors.length ? mean(absErrors) : null;

const withImportance = details.filter((item) => item.expect.importance);
const importanceHits = withImportance.filter((item) => item.checks.importanceOk).length;
const importanceAccuracy = withImportance.length ? importanceHits / withImportance.length : 0;

const confusion = {};
for (const item of withImportance) {
  const expected = item.expect.importance;
  const actual = item.actual?.importance ?? 'none';
  confusion[expected] = confusion[expected] || {};
  confusion[expected][actual] = (confusion[expected][actual] || 0) + 1;
}

const realCases = details.filter((item) => item.expect.isReal === true);
const fakeCases = details.filter((item) => item.expect.isReal === false);
const truePositive = realCases.filter((item) => item.actual?.isReal === true).length;
const falseNegative = realCases.length - truePositive;
const falsePositive = fakeCases.filter((item) => item.actual?.isReal === true).length;
const trueNegative = fakeCases.length - falsePositive;
const precision = truePositive + falsePositive ? truePositive / (truePositive + falsePositive) : 0;
const recall = truePositive + falseNegative ? truePositive / (truePositive + falseNegative) : 0;
const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;

const schemaOkCount = details.filter((item) => item.actual?.aiStatus === 'analyzed').length;
const schemaOkRate = schemaOkCount / details.length;
const summaryOkRate = details.filter((item) => item.checks.summaryOk).length / details.length;

const metrics = {
  bandAccuracy: round(bandAccuracy),
  relevanceMae: mae === null ? null : round(mae, 2),
  importanceAccuracy: round(importanceAccuracy),
  importanceConfusion: confusion,
  isReal: {
    precision: round(precision),
    recall: round(recall),
    f1: round(f1),
    truePositive,
    falsePositive,
    trueNegative,
    falseNegative,
  },
  schemaOkRate: round(schemaOkRate),
  summaryOkRate: round(summaryOkRate),
  avgLatencyMs: Math.round(mean(latencies)),
  p95LatencyMs: Math.round(percentile(latencies, 0.95)),
  stabilityStdDev: opts.repeat > 1 ? round(mean(stability), 2) : null,
};

const checks = {
  band: bandAccuracy >= opts.minBand,
  importance: importanceAccuracy >= opts.minImportance,
  schema: schemaOkRate >= opts.minSchema,
};
const failedChecks = Object.entries(checks)
  .filter(([, ok]) => !ok)
  .map(([key]) => key);
const passed = failedChecks.length === 0;

const report = {
  generatedAt: new Date().toISOString(),
  engine,
  model: engine === 'model' ? config.ai.model : 'heuristic-v1',
  fallbackModel: engine === 'model' ? config.ai.fallbackModel : null,
  fixture: path.relative(PROJECT_ROOT, opts.fixture),
  scope,
  repeat: opts.repeat,
  caseCount: details.length,
  thresholds: { minBand: opts.minBand, minImportance: opts.minImportance, minSchema: opts.minSchema },
  metrics,
  passed: engine === 'model' ? passed : null,
  failedChecks: engine === 'model' ? failedChecks : [],
  details,
};

if (opts.write) {
  await writeFile(opts.out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

if (opts.jsonOnly) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const pct = (value) => `${(value * 100).toFixed(1)}%`;
  console.log(`  相关度分档命中   ${pct(bandAccuracy)}  (${bandHits}/${withBand.length})   下限 ${pct(opts.minBand)}`);
  console.log(`  相关度 MAE       ${mae === null ? '—' : mae.toFixed(1)} 分`);
  console.log(
    `  重要度准确率     ${pct(importanceAccuracy)}  (${importanceHits}/${withImportance.length})   下限 ${pct(opts.minImportance)}`,
  );
  console.log(
    `  真伪判定         F1 ${f1.toFixed(2)}  (P ${precision.toFixed(2)} / R ${recall.toFixed(2)} · TP ${truePositive} FP ${falsePositive} TN ${trueNegative} FN ${falseNegative})`,
  );
  console.log(
    `  结构化输出       ${pct(schemaOkRate)}  (${schemaOkCount}/${details.length})   下限 ${pct(opts.minSchema)}`,
  );
  console.log(`  摘要长度合规     ${pct(summaryOkRate)}`);
  console.log(`  延迟             平均 ${metrics.avgLatencyMs}ms · p95 ${metrics.p95LatencyMs}ms`);
  if (opts.repeat > 1) console.log(`  稳定性          相关度 σ ${metrics.stabilityStdDev}（${opts.repeat} 次重复）`);

  const misses = details.filter((item) => !item.checks.inBand || item.checks.importanceOk === false);
  if (misses.length) {
    console.log('\n  未达标样例：');
    for (const item of misses) {
      const actual = item.actual
        ? `REL ${item.actual.relevance} / ${item.actual.importance}`
        : `失败 ${item.error || '无输出'}`;
      console.log(
        `   · ${item.id.padEnd(28)} 期望 ${item.expect.relevanceBand?.join('-') ?? '-'} / ${item.expect.importance ?? '-'}   实际 ${actual}`,
      );
    }
  }

  console.log('  ' + '-'.repeat(64));
  if (engine === 'heuristic') {
    console.log('  启发式基线：仅用于确认流程可用，不计入通过/失败；配上 OPENROUTER_API_KEY 后再跑可得到模型评测。');
  } else if (passed) {
    console.log('  结果：通过');
  } else {
    console.log(`  结果：未通过（${failedChecks.join(', ')}）`);
  }
  if (opts.write) console.log(`  报告：${path.relative(PROJECT_ROOT, opts.out)}`);
  console.log('');
}

process.exit(engine === 'model' && !passed ? 1 : 0);
