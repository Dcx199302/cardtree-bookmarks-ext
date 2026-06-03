import { useState, useRef, useImperativeHandle, forwardRef } from 'react';

interface SearchBarProps {
  onQueryChange: (query: string) => void;
}

export interface SearchBarRef {
  focus: () => void;
}

export const SearchBar = forwardRef<SearchBarRef, SearchBarProps>(function SearchBar({ onQueryChange }, ref) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }));

  const handleChange = (value: string) => {
    setQuery(value);
    onQueryChange(value);
  };

  const handleClear = () => {
    setQuery('');
    onQueryChange('');
    inputRef.current?.focus();
  };

  return (
    <div className="search-bar">
      <div className={`search-bar-inner${focused ? ' search-bar-inner--focused' : ''}`}>
        <svg className="search-bar-icon" width="18" height="18" viewBox="0 0 16 16" fill="none">
          <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
          <line x1="10.5" y1="10.5" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          className="search-bar-input"
          type="text"
          placeholder="搜索书签..."
          value={query}
          onChange={e => handleChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {query ? (
          <button className="search-bar-clear" onMouseDown={e => e.preventDefault()} onClick={handleClear}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <line x1="4" y1="4" x2="12" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="12" y1="4" x2="4" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        ) : !focused && (
          <span className="search-bar-hint">/</span>
        )}
      </div>
    </div>
  );
});
