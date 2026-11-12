/**
 * 关键词相关性守卫：英文按词边界，中文按子串。
 * 兼容 "Open AI" 与 "OpenAI"，同时避免 "AI" 误命中 "training"。
 */
export const normalizeText = (value) =>
  String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\-_/]+/g, ' ')
    .trim();

const compactText = (value) => normalizeText(value).replace(/\s+/g, '');
const CJK = /[\u3400-\u9fff]/;
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordMatch = (token, text) => new RegExp(`\\b${escapeRegExp(token)}\\b`).test(text);

export const matchesKeyword = (text, term) => {
  const normalizedText = normalizeText(text);
  const normalizedTerm = normalizeText(term);
  if (!normalizedTerm) return false;

  const tokens = normalizedTerm.split(' ').filter(Boolean);
  const compactTextValue = compactText(normalizedText);
  const compactTerm = compactText(normalizedTerm);

  if (CJK.test(normalizedTerm)) {
    if (normalizedText.includes(normalizedTerm)) return true;
    if (
      tokens.length > 1 &&
      tokens.every((token) =>
        CJK.test(token) ? normalizedText.includes(token) : wordMatch(token, normalizedText),
      )
    ) {
      return true;
    }
    return compactTextValue.includes(compactTerm);
  }

  if (compactTerm.length >= 4) {
    const boundary = new RegExp(`(^|[^a-z0-9])${escapeRegExp(compactTerm)}($|[^a-z0-9])`);
    if (boundary.test(compactTextValue)) return true;
  }
  return tokens.length > 1
    ? tokens.every((token) => wordMatch(token, normalizedText))
    : wordMatch(normalizedTerm, normalizedText);
};
