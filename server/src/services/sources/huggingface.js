import { config } from '../../config.js';

/**
 * HuggingFace Models API：按 lastModified 倒序，捕捉模型上新
 */
export async function searchHuggingFace(keyword) {
  if (!config.sources.huggingface) return { items: [], skipped: '已关闭' };

  const params = new URLSearchParams({
    search: keyword.term,
    sort: 'lastModified',
    direction: '-1',
    limit: String(config.crawler.perKeywordLimit),
  });

  try {
    const response = await fetch(`https://huggingface.co/api/models?${params}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`HuggingFace HTTP ${response.status}`);
    const payload = await response.json();

    const items = (Array.isArray(payload) ? payload : [])
      .map((model) => {
        if (!model.id) return null;
        const meta = [
          model.pipeline_tag || 'model',
          `${model.likes ?? 0} likes`,
          `${model.downloads ?? 0} downloads`,
        ].join(' · ');
        return {
          title: `HuggingFace 模型更新：${model.id}`,
          url: `https://huggingface.co/${model.id}`,
          snippet: meta,
          author: 'HuggingFace',
          publishedAt: model.lastModified || null,
          engagement: (model.likes || 0) * 3 + Math.round((model.downloads || 0) / 50),
        };
      })
      .filter(Boolean);

    return { items, skipped: null };
  } catch (error) {
    return { items: [], skipped: error.message };
  }
}
