import { config } from '../config.js';

const IMPORTANCE_SET = new Set(['low', 'medium', 'high', 'urgent']);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 依据 OpenRouter 最新文档（2026-11 校验）：Chat Completions 使用 response_format.type = json_schema
const RESPONSE_SCHEMA = {
  name: 'hotspot_analysis',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      isReal: { type: 'boolean', description: '是否为可核实的真实热点，标题党/谣言/无来源传闻为 false' },
      relevance: { type: 'integer', minimum: 0, maximum: 100, description: '与监控领域的相关度' },
      importance: {
        type: 'string',
        enum: ['low', 'medium', 'high', 'urgent'],
        description: '影响范围与时效性综合定级',
      },
      summary: { type: 'string', description: '中文事实摘要，50 字以内' },
      reason: { type: 'string', description: '一句话说明真假判断依据' },
    },
    required: ['isReal', 'relevance', 'importance', 'summary', 'reason'],
    additionalProperties: false,
  },
};

const SYSTEM_PROMPT = `你是一个严谨的中文热点分析专家，服务于一位 AI 编程博主。
你的任务是判断一条候选内容是否值得作为"AI 领域热点"推送给博主，并识别标题党、营销稿、假冒爆料和拼接谣言。

判断原则：
1. 只有可核实的发布（官方博客/公告、权威媒体、当事方账号、有明确来源的报道）才可判为真实热点。
2. 无来源的"据说/内部消息/网传"、夸张标题、纯引流内容判为 isReal=false。
3. 链接域名属于当事方官方站点，或 github.com / huggingface.co / arxiv.org 的官方组织页时，视为可核实来源，倾向 isReal=true。
4. relevance 衡量内容与监控领域的相关度（0-100），与内容真假无关。
5. importance 依据影响范围判断：urgent=旗舰模型发布/重大事故/行业格局变化；high=重要更新或重要人物表态；medium=有价值的常规动态；low=边缘信息。
6. summary 用中文，50 字以内，陈述事实，不加主观评价。

必须只输出一个 JSON 对象，不要输出 markdown 代码块，不要输出任何解释文字：
{"isReal": true, "relevance": 0, "importance": "low", "summary": "", "reason": ""}`;

function buildUserPrompt(hotspot, scope) {
  return `监控范围：${scope}

候选内容：
- 标题：${hotspot.title}
- 来源：${hotspot.source}${hotspot.author ? ` / ${hotspot.author}` : ''}
- 发布时间：${hotspot.publishedAt || '未知'}
- 互动量：${hotspot.engagement ?? 0}
- 链接：${hotspot.url || '无'}
- 摘要：${hotspot.snippet || '无'}

字段约束：relevance 为 0-100 的整数；importance 只能是 low/medium/high/urgent 之一；reason 用一句话说明真假判断依据（40 字以内）。`;
}

function extractJson(text) {
  if (!text) return null;
  const cleaned = String(text)
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalizeAnalysis(raw, meta = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const importance = String(raw.importance || '').toLowerCase();
  const relevance = Number.parseInt(raw.relevance, 10);
  return {
    isReal: typeof raw.isReal === 'boolean' ? raw.isReal : null,
    relevance: Number.isNaN(relevance) ? null : Math.max(0, Math.min(100, relevance)),
    importance: IMPORTANCE_SET.has(importance) ? importance : 'medium',
    summary: String(raw.summary || '').trim().slice(0, 160) || null,
    aiReason: String(raw.reason || raw.aiReason || '').trim().slice(0, 200) || null,
    aiModel: meta.model || null,
    aiStatus: meta.aiStatus || 'analyzed',
  };
}

async function callOpenRouter(model, hotspot, scope) {
  const response = await fetch(`${config.ai.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.ai.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost',
      'X-OpenRouter-Title': 'NEON WATCH - AI Hotspot Monitor',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 600,
      response_format: { type: 'json_schema', json_schema: RESPONSE_SCHEMA },
      // 注意：不启用 provider.require_parameters，DeepSeek 的部分端点未在能力表中
      // 声明 structured_outputs，强过滤会导致主模型被跳过；解析失败仍会走备用模型。
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(hotspot, scope) },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`OpenRouter ${response.status}: ${body.slice(0, 200)}`);
  }

  const payload = await response.json();
  const message = payload.choices?.[0]?.message;
  const content = message?.content ?? message?.reasoning;
  if (!content) throw new Error('OpenRouter 返回内容为空');
  return extractJson(content);
}

function heuristicAnalysis(hotspot, scope, reason) {
  const text = `${hotspot.title} ${hotspot.snippet || ''}`;
  const clickbait = ['震惊', '速看', '炸裂', '刚刚', '重磅', '惊爆', '不得了', '必看', '揭秘', '内部消息', '据说', '网传'];
  const suspiciousHits = clickbait.filter((word) => hotspot.title.includes(word)).length;
  const noSource = !hotspot.url || /(?:^|\W)(?:example|test)\./i.test(hotspot.url);
  const thin = (hotspot.snippet || '').length < 30;
  const isReal = suspiciousHits < 2 && !noSource && !thin;

  const scopeTerms = scope
    .split(/[、,，\s]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
  const matched = scopeTerms.filter((t) => text.toLowerCase().includes(t.toLowerCase())).length;
  const relevance = Math.min(100, 45 + matched * 18 + Math.min((hotspot.snippet || '').length / 12, 20));

  const engagement = hotspot.engagement || 0;
  let importance = 'low';
  if (engagement >= 800) importance = 'urgent';
  else if (engagement >= 300) importance = 'high';
  else if (engagement >= 80 || relevance >= 80) importance = 'medium';

  const summary = (hotspot.snippet || hotspot.title).replace(/\s+/g, ' ').slice(0, 50);

  return {
    isReal,
    relevance: Math.round(relevance),
    importance,
    summary,
    aiReason: `启发式判定（未调用大模型）：${reason || '未配置 OPENROUTER_API_KEY'}`,
    aiModel: 'heuristic-v1',
    aiStatus: 'heuristic',
  };
}

/**
 * 分析单条热点：OpenRouter 主模型 -> 备用模型 -> 启发式兜底
 * @returns {Promise<object|null>} 分析结果；无法分析时返回 null（保持 pending）
 */
export async function analyzeHotspot(hotspot, { scope = config.ai.scope } = {}) {
  if (!config.ai.apiKey) {
    if (config.ai.heuristicFallback) return heuristicAnalysis(hotspot, scope);
    return null;
  }

  let lastError = null;
  const models = [config.ai.model, config.ai.fallbackModel].filter(Boolean);
  for (const model of models) {
    try {
      const raw = await callOpenRouter(model, hotspot, scope);
      const normalized = normalizeAnalysis(raw, { model, aiStatus: 'analyzed' });
      if (normalized) return normalized;
      lastError = new Error('模型输出无法解析为 JSON');
    } catch (error) {
      lastError = error;
      await sleep(500);
    }
  }

  if (config.ai.heuristicFallback) {
    return heuristicAnalysis(hotspot, scope, `主模型与备用模型均失败：${lastError?.message || '未知错误'}`);
  }
  throw lastError || new Error('AI 分析失败');
}

/**
 * 批量分析，控制并发，单条失败不影响其他条目
 */
export async function analyzeBatch(hotspots, { scope, concurrency = 3 } = {}) {
  const results = [];
  let cursor = 0;

  const worker = async () => {
    while (cursor < hotspots.length) {
      const index = cursor;
      cursor += 1;
      const hotspot = hotspots[index];
      try {
        const analysis = await analyzeHotspot(hotspot, { scope });
        results.push({ id: hotspot.id, analysis, error: null });
      } catch (error) {
        results.push({ id: hotspot.id, analysis: null, error: error.message });
      }
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, hotspots.length)) }, worker));
  return results;
}

export const aiMeta = () => ({
  configured: Boolean(config.ai.apiKey),
  model: config.ai.model,
  fallbackModel: config.ai.fallbackModel,
  heuristicFallback: config.ai.heuristicFallback,
});
