#!/usr/bin/env node
/**
 * NEON//WATCH Skill CLI
 * 无第三方依赖，供 Agent 直接调用本地监控 API。
 */
const BASE = (process.env.WATCH_API || 'http://localhost:8787').replace(/\/$/, '');
const TIMEOUT = Number(process.env.WATCH_TIMEOUT || 120_000);

const [command, ...rest] = process.argv.slice(2);

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[index + 1];
      if (!next || next.startsWith('--')) flags[key] = true;
      else {
        flags[key] = next;
        index += 1;
      }
    } else {
      positional.push(token);
    }
  }
  return { positional, flags };
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT),
    ...options,
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    const message = body?.error || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return body;
}

const out = (value) => console.log(JSON.stringify(value, null, 2));

async function main() {
  const { positional, flags } = parseArgs(rest);
  const limit = flags.limit ? Number(flags.limit) : undefined;

  switch (command) {
    case 'stats': {
      out(await request('/api/stats'));
      return;
    }

    case 'hotspots': {
      const search = new URLSearchParams();
      if (limit) search.set('limit', String(limit));
      if (flags.importance) search.set('importance', String(flags.importance));
      if (flags.source) search.set('source', String(flags.source));
      if (flags.days) search.set('days', String(flags.days));
      if (flags.hours) search.set('hours', String(flags.hours));
      if (flags.q) search.set('q', String(flags.q));
      if (flags.keyword) search.set('keyword', String(flags.keyword));
      if (flags.real) search.set('isReal', 'real');
      if (flags.fake) search.set('isReal', 'fake');
      if (flags.unknown) search.set('isReal', 'unknown');
      if (flags.status) search.set('status', String(flags.status));
      if (flags['relevance-min']) search.set('relevanceMin', String(flags['relevance-min']));
      if (flags['engagement-min']) search.set('engagementMin', String(flags['engagement-min']));
      if (flags.from) search.set('from', String(flags.from));
      if (flags.to) search.set('to', String(flags.to));
      if (flags.notified) search.set('notified', String(flags.notified));
      if (flags.sort) search.set('sort', String(flags.sort));
      if (flags.dir) search.set('dir', String(flags.dir));
      if (flags['title-only']) search.set('qMode', 'title');
      if (flags.dated) search.set('dated', 'true');
      out(await request(`/api/hotspots?${search.toString()}`));
      return;
    }

    case 'get': {
      if (!positional[0]) throw new Error('用法：get <hotspotId>');
      out(await request(`/api/hotspots/${encodeURIComponent(positional[0])}`));
      return;
    }

    case 'search': {
      const term = positional.join(' ').trim();
      if (!term) throw new Error('用法：search <关键词> [--domain 范围]');
      out(
        await request('/api/hotspots/search', {
          method: 'POST',
          body: JSON.stringify({ term, domain: flags.domain || '', analyze: !flags['no-ai'] }),
        }),
      );
      return;
    }

    case 'analyze': {
      if (!positional[0]) throw new Error('用法：analyze <hotspotId>');
      out(await request(`/api/hotspots/${encodeURIComponent(positional[0])}/analyze`, { method: 'POST' }));
      return;
    }

    case 'keywords': {
      out(await request('/api/keywords'));
      return;
    }

    case 'add-keyword': {
      const term = positional.join(' ').trim();
      if (!term) throw new Error('用法：add-keyword <关键词> [--domain 范围]');
      out(
        await request('/api/keywords', {
          method: 'POST',
          body: JSON.stringify({ term, domain: flags.domain || '' }),
        }),
      );
      return;
    }

    case 'toggle-keyword': {
      const [id, state] = positional;
      if (!id || !state) throw new Error('用法：toggle-keyword <id> <on|off>');
      out(
        await request(`/api/keywords/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify({ enabled: state === 'on' }),
        }),
      );
      return;
    }

    case 'delete-keyword': {
      if (!positional[0]) throw new Error('用法：delete-keyword <id>');
      out(await request(`/api/keywords/${encodeURIComponent(positional[0])}`, { method: 'DELETE' }));
      return;
    }

    case 'collect': {
      out(await request('/api/collect', { method: 'POST', body: '{}' }));
      return;
    }

    case 'pending': {
      out(
        await request('/api/analyze-pending', {
          method: 'POST',
          body: JSON.stringify({ limit: limit || 5 }),
        }),
      );
      return;
    }

    case 'notifications': {
      const search = limit ? `?limit=${limit}` : '';
      out(await request(`/api/notifications${search}`));
      return;
    }

    case 'health': {
      out(await request('/api/health'));
      return;
    }

    default: {
      console.error(
        [
          'NEON//WATCH Skill CLI',
          '',
          '可用命令：',
          '  stats',
          '  hotspots [--limit N] [--importance urgent,high] [--source baidu,ithome] [--hours N|--days N]',
          '           [--sort latest|importance|relevance|engagement|recommended|pending|unnotified]',
          '           [--relevance-min N] [--engagement-min N] [--status analyzed,heuristic]',
          '           [--notified true|false] [--from YYYY-MM-DD] [--to YYYY-MM-DD]',
          '           [--q 文本] [--title-only] [--real|--fake|--unknown] [--keyword 词] [--dated]',
          '  get <id>',
          '  search <关键词> [--domain 范围] [--no-ai]',
          '  analyze <id>',
          '  keywords',
          '  add-keyword <关键词> [--domain 范围]',
          '  toggle-keyword <id> <on|off>',
          '  delete-keyword <id>',
          '  collect',
          '  pending [--limit N]',
          '  notifications [--limit N]',
          '  health',
        ].join('\n'),
      );
      process.exit(command ? 1 : 0);
    }
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error.message }, null, 2));
  process.exit(1);
});
