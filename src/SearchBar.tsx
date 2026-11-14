import { useCallback, useRef, useState, forwardRef, useImperativeHandle } from 'react';

interface SearchBarProps {
  onQueryChange: (query: string) => void;
}

export interface SearchBarRef {
  focus: () => void;
  clear: () => void;
  isInputActive: () => boolean;
}

// 书签搜索图标（放大镜）
const BOOKMARK_SEARCH_ICON = (
  <svg className="search-bar-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
    <line x1="10.5" y1="10.5" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const SearchBar = forwardRef<SearchBarRef, SearchBarProps>(function SearchBar(
  { onQueryChange },
  ref,
) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const clear = useCallback(() => {
    setQuery('');
    onQueryChange('');
    inputRef.current?.focus();
  }, [onQueryChange]);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    clear,
    isInputActive: () => document.activeElement === inputRef.current,
  }), [clear]);

  return (
    <div className="search-bar">
      <div className={`search-bar-inner${focused ? ' search-bar-inner--focused' : ''}`}>
        {BOOKMARK_SEARCH_ICON}
        <input
          ref={inputRef}
          className="search-bar-input"
          type="text"
          placeholder="搜索书签…"
          aria-label="搜索书签"
          value={query}
          onChange={event => {
            const value = event.target.value;
            setQuery(value);
            onQueryChange(value);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {query ? (
          <button
            type="button"
            className="search-bar-clear"
            aria-label="清空书签搜索"
            onMouseDown={event => event.preventDefault()}
            onClick={clear}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <line x1="4" y1="4" x2="12" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="12" y1="4" x2="4" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        ) : !focused && (
          <span className="search-bar-hints">
            <span className="search-bar-hint">/</span>
          </span>
        )}
      </div>
    </div>
  );
});
