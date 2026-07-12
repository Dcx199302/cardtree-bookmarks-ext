import { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import type { SearchEngine } from './searchEnginesStore';
import { buildSearchUrl } from './searchEnginesStore';
import { FaviconImg } from './FaviconImg';

interface SearchBarProps {
  onQueryChange: (query: string) => void;
  engines: SearchEngine[];
  onOpenEngineSettings: () => void;
}

export interface SearchBarRef {
  focus: () => void;
}

// 书签搜索图标（放大镜）
const BOOKMARK_SEARCH_ICON = (
  <svg className="search-bar-icon" width="18" height="18" viewBox="0 0 16 16" fill="none">
    <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
    <line x1="10.5" y1="10.5" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const SearchBar = forwardRef<SearchBarRef, SearchBarProps>(function SearchBar({ onQueryChange, engines, onOpenEngineSettings }, ref) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [selectedEngine, setSelectedEngine] = useState<SearchEngine | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownTimerRef = useRef<number | null>(null);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }));

  useEffect(() => {
    return () => { if (dropdownTimerRef.current) clearTimeout(dropdownTimerRef.current); };
  }, []);

  const isBookmarkMode = selectedEngine === null;

  const selectBookmarkMode = () => {
    setSelectedEngine(null);
    setQuery('');
    onQueryChange('');
    setDropdownOpen(false);
  };

  const handleSelectEngine = (engine: SearchEngine) => {
    if (selectedEngine?.id === engine.id) {
      selectBookmarkMode();
    } else {
      setSelectedEngine(engine);
      onQueryChange('');
    }
    setDropdownOpen(false);
  };

  const handleTriggerEnter = () => {
    if (dropdownTimerRef.current) { clearTimeout(dropdownTimerRef.current); dropdownTimerRef.current = null; }
    setDropdownOpen(true);
  };
  const handleTriggerLeave = () => {
    dropdownTimerRef.current = window.setTimeout(() => setDropdownOpen(false), 250);
  };
  // 左侧图标点击：选中引擎时切回书签搜索
  const handleTriggerClick = () => {
    if (selectedEngine) selectBookmarkMode();
  };

  const handleChange = (value: string) => {
    setQuery(value);
    if (!selectedEngine) onQueryChange(value);
  };
  const handleClear = () => {
    setQuery('');
    onQueryChange('');
    inputRef.current?.focus();
  };
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && selectedEngine && query.trim()) {
      window.open(buildSearchUrl(selectedEngine, query), '_blank');
    }
  };

  const placeholder = selectedEngine ? `使用 ${selectedEngine.name} 搜索，回车打开` : "搜索标签(可切换引擎搜索)...";

  return (
    <div className="search-bar">
      <div className={`search-bar-inner${focused ? ' search-bar-inner--focused' : ''}`}>
        <div
          className="search-bar-engine-trigger"
          onMouseEnter={handleTriggerEnter}
          onMouseLeave={handleTriggerLeave}
          onClick={handleTriggerClick}
        >
          {selectedEngine ? <FaviconImg url={selectedEngine.iconUrl ?? selectedEngine.searchUrl} /> : BOOKMARK_SEARCH_ICON}
        </div>
        <input
          ref={inputRef}
          className="search-bar-input"
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={e => handleChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={handleKeyDown}
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
      {dropdownOpen && (
        <div
          className="engine-dropdown-overlay"
          onMouseEnter={handleTriggerEnter}
          onMouseLeave={handleTriggerLeave}
        >
          <div className="engine-dropdown">
            {/* 第一个固定：书签搜索 */}
            <button
              className={`engine-option${isBookmarkMode ? ' engine-option--active' : ''}`}
              title="书签搜索"
              onClick={selectBookmarkMode}
            >
              <span className="engine-option-icon">{BOOKMARK_SEARCH_ICON}</span>
              <span className="engine-option-name">书签搜索</span>
            </button>
            <div className="engine-dropdown-divider" />
            {engines.map(engine => (
              <button
                key={engine.id}
                className={`engine-option${selectedEngine?.id === engine.id ? ' engine-option--active' : ''}`}
                title={engine.name}
                onClick={() => handleSelectEngine(engine)}
              >
                <span className="engine-option-icon">
                  <FaviconImg url={engine.iconUrl ?? engine.searchUrl} />
                </span>
                <span className="engine-option-name">{engine.name}</span>
              </button>
            ))}
            <div className="engine-dropdown-divider" />
            <button className="engine-option engine-option--settings" onClick={onOpenEngineSettings}>
              <span className="engine-option-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </span>
              <span className="engine-option-name">管理引擎</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
