import { useEffect, useRef, useState } from 'react';
import { readSearchHistory, pushSearchHistory, clearSearchHistory } from '../search';

/**
 * 语法搜索框：400ms 防抖提交 + 最近搜索历史。
 * Enter 提交并写入历史；从历史选择等价于一次显式搜索。
 */
export function SearchBox({
  value,
  onCommit,
  placeholder,
  compact = false,
  label = '搜索热点',
}: {
  value: string;
  onCommit: (term: string) => void;
  placeholder?: string;
  compact?: boolean;
  label?: string;
}) {
  const [text, setText] = useState(value);
  const [history, setHistory] = useState<string[]>(readSearchHistory);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  const lastCommitted = useRef(value.trim());

  // 外部 value 变化（URL 还原 / 清除）时同步本地输入
  useEffect(() => {
    setText(value);
    lastCommitted.current = value.trim();
  }, [value]);

  // 防抖 400ms 提交（与最近一次提交相同则跳过，避免 Enter 后重复触发）
  useEffect(() => {
    const trimmed = text.trim();
    if (trimmed === lastCommitted.current) return;
    const timer = setTimeout(() => {
      lastCommitted.current = trimmed;
      commitRef.current(trimmed);
    }, 400);
    return () => clearTimeout(timer);
  }, [text]);

  // 点击外部关闭历史下拉
  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const commit = (term: string, record = false) => {
    const trimmed = term.trim();
    setText(term);
    lastCommitted.current = trimmed;
    commitRef.current(trimmed);
    if (record) setHistory(pushSearchHistory(term));
    setOpen(false);
  };

  const trimmed = text.trim();
  const visibleHistory = history.filter((item) => !trimmed || item.includes(trimmed));

  return (
    <div className={`searchbox ${compact ? 'searchbox--compact' : ''}`} ref={boxRef}>
      <span className="searchbox__prompt" aria-hidden="true">
        /
      </span>
      <input
        type="text"
        value={text}
        aria-label={label}
        placeholder={placeholder ?? '搜索信号：空格分词 · -排除 · "精确短语"'}
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit(text, true);
          } else if (event.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {text && (
        <button
          type="button"
          className="searchbox__clear"
          aria-label="清空搜索"
          onClick={() => commit('')}
        >
          ×
        </button>
      )}
      {open && visibleHistory.length > 0 && (
        <div className="searchbox__history" role="listbox" aria-label="最近搜索">
          <div className="searchbox__history-head">
            <span>最近搜索</span>
            <button
              type="button"
              onClick={() => {
                setHistory(clearSearchHistory());
              }}
            >
              清空历史
            </button>
          </div>
          {visibleHistory.map((item) => (
            <button type="button" role="option" aria-selected="false" key={item} onClick={() => commit(item, true)}>
              <span className="searchbox__history-glyph" aria-hidden="true">
                ⌕
              </span>
              {item}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
