import { useState, useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import type { SearchEngine } from './searchEnginesStore';
import { buildSearchUrl } from './searchEnginesStore';
import { FaviconImg } from './FaviconImg';
import { loadSearchHistory, addSearchHistory, clearSearchHistory, loadLastEngineId, saveLastEngineId, loadLastSearchMode, saveLastSearchMode } from './searchHistoryStore';

export type SearchMode = 'bookmark' | 'engine';

interface SearchBarProps {
  onQueryChange: (query: string) => void;
  engines: SearchEngine[];
  onOpenEngineSettings: () => void;
  onModeChange?: (mode: SearchMode) => void;
}

export interface SearchBarRef {
  focus: () => void;
  toggleMode: () => void;
}

// 书签搜索图标（放大镜）
const BOOKMARK_SEARCH_ICON = (
  <svg className="search-bar-icon" width="18" height="18" viewBox="0 0 16 16" fill="none">
    <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
    <line x1="10.5" y1="10.5" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

// 历史记录图标（时钟）
const HISTORY_ICON = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="8" r="6" />
    <polyline points="8 4.5 8 8 10.5 9.5" />
  </svg>
);

export const SearchBar = forwardRef<SearchBarRef, SearchBarProps>(function SearchBar(
  { onQueryChange, engines, onOpenEngineSettings, onModeChange },
  ref,
) {
  const [mode, setMode] = useState<SearchMode>('bookmark');
  const [bookmarkQuery, setBookmarkQuery] = useState('');
  const [engineQuery, setEngineQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [selectedEngine, setSelectedEngine] = useState<SearchEngine | null>(null);
  const [engineDropdownOpen, setEngineDropdownOpen] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownTimerRef = useRef<number | null>(null);
  const historyTimerRef = useRef<number | null>(null);
  const enginePreviewTimerRef = useRef<number | null>(null);
  const engineRestoredRef = useRef(false);

  // 加载搜索历史
  useEffect(() => {
    loadSearchHistory().then(setHistory).catch(() => {});
  }, []);

  // 恢复上次选中的搜索引擎和搜索模式（仅首次加载引擎列表后执行一次）
  // 引擎列表为空时不恢复引擎模式，避免搜索功能不可用
  useEffect(() => {
    if (engineRestoredRef.current || engines.length === 0) return;
    engineRestoredRef.current = true;
    Promise.all([loadLastEngineId(), loadLastSearchMode()])
      .then(([id, savedMode]) => {
        const engine = id ? engines.find(e => e.id === id) : null;
        setSelectedEngine(engine ?? engines[0] ?? null);
        if (savedMode === 'engine') {
          setMode('engine');
          onModeChange?.('engine');
          onQueryChange('');
        }
      })
      .catch(() => setSelectedEngine(engines[0] ?? null));
  }, [engines]);

  // 当前选中的引擎被删除时回退到第一个
  useEffect(() => {
    if (!selectedEngine || engines.length === 0) return;
    if (!engines.some(e => e.id === selectedEngine.id)) {
      const fallback = engines[0] ?? null;
      setSelectedEngine(fallback);
      if (fallback) saveLastEngineId(fallback.id).catch(() => {});
    }
  }, [engines, selectedEngine]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (dropdownTimerRef.current) clearTimeout(dropdownTimerRef.current);
      if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
      if (enginePreviewTimerRef.current) clearTimeout(enginePreviewTimerRef.current);
    };
  }, []);

  const query = mode === 'bookmark' ? bookmarkQuery : engineQuery;

  // ── 模式切换 ──
  const switchToBookmark = useCallback(() => {
    setMode('bookmark');
    onModeChange?.('bookmark');
    onQueryChange(bookmarkQuery);
    saveLastSearchMode('bookmark').catch(() => {});
    setEngineDropdownOpen(false);
    setHistoryOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [bookmarkQuery, onQueryChange, onModeChange]);

  const switchToEngine = useCallback(() => {
    setMode('engine');
    onModeChange?.('engine');
    onQueryChange('');
    saveLastSearchMode('engine').catch(() => {});
    setEngineDropdownOpen(false);
    setHistoryOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
 }, [onQueryChange, onModeChange]);

  // 切换搜索模式（书签 ↔ 引擎），供全局快捷键和输入框内 Tab 共用
  const toggleMode = useCallback(() => {
    if (mode === 'bookmark') switchToEngine();
    else switchToBookmark();
  }, [mode, switchToEngine, switchToBookmark]);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    toggleMode,
  }), [toggleMode]);

  // 方向键切换引擎时短暂展示下拉框，延迟自动收起
  const previewEngineDropdown = useCallback(() => {
    setHistoryOpen(false);
    setEngineDropdownOpen(true);
    if (enginePreviewTimerRef.current) clearTimeout(enginePreviewTimerRef.current);
    enginePreviewTimerRef.current = window.setTimeout(() => setEngineDropdownOpen(false), 1200);
  }, []);

  const handleSelectEngine = useCallback((engine: SearchEngine) => {
    // 点击当前已选引擎 → 切回书签模式
    if (mode === 'engine' && selectedEngine?.id === engine.id) {
      switchToBookmark();
      return;
    }
    setSelectedEngine(engine);
    saveLastEngineId(engine.id).catch(() => {});
    if (mode !== 'engine') {
      setMode('engine');
      onModeChange?.('engine');
      onQueryChange('');
      saveLastSearchMode('engine').catch(() => {});
    }
    setEngineDropdownOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [mode, selectedEngine, switchToBookmark, onQueryChange, onModeChange]);

  // ── 引擎选择下拉（hover 触发）──
  const openEngineDropdown = useCallback(() => {
    if (dropdownTimerRef.current) { clearTimeout(dropdownTimerRef.current); dropdownTimerRef.current = null; }
    if (enginePreviewTimerRef.current) { clearTimeout(enginePreviewTimerRef.current); enginePreviewTimerRef.current = null; }
    setEngineDropdownOpen(true);
  }, []);
  const closeEngineDropdown = useCallback(() => {
    dropdownTimerRef.current = window.setTimeout(() => setEngineDropdownOpen(false), 250);
  }, []);

  // ── 搜索历史下拉（focus 触发）──
  const openHistory = useCallback(() => {
    if (historyTimerRef.current) { clearTimeout(historyTimerRef.current); historyTimerRef.current = null; }
    setHistoryOpen(true);
  }, []);
  const closeHistory = useCallback(() => {
    historyTimerRef.current = window.setTimeout(() => setHistoryOpen(false), 200);
  }, []);

  const handleInputChange = (value: string) => {
    if (mode === 'bookmark') {
      setBookmarkQuery(value);
      onQueryChange(value);
    } else {
      setEngineQuery(value);
    }
  };

  const handleClear = () => {
    if (mode === 'bookmark') {
      setBookmarkQuery('');
      onQueryChange('');
    } else {
      setEngineQuery('');
    }
    inputRef.current?.focus();
  };

  const handleSearch = useCallback(async () => {
    const q = engineQuery.trim();
    if (!q || !selectedEngine) return;
    window.open(buildSearchUrl(selectedEngine, q), '_blank');
    try {
      setHistory(await addSearchHistory(q));
    } catch { /* ignore */ }
  }, [engineQuery, selectedEngine]);

  const handleHistoryClick = useCallback(async (term: string) => {
    setEngineQuery(term);
    setHistoryOpen(false);
    if (selectedEngine) {
      window.open(buildSearchUrl(selectedEngine, term), '_blank');
      try {
        setHistory(await addSearchHistory(term));
      } catch { /* ignore */ }
    }
  }, [selectedEngine]);

  const handleClearHistory = useCallback(async () => {
    await clearSearchHistory();
    setHistory([]);
    setHistoryOpen(false);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Tab 切换搜索模式（Shift+Tab 保留原生焦点遍历）
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      toggleMode();
      return;
    }
    if (e.key === 'Enter' && mode === 'engine') {
      e.preventDefault();
      handleSearch();
      return;
    }
    if (e.key === 'Escape') {
      if (engineDropdownOpen) { setEngineDropdownOpen(false); e.preventDefault(); e.stopPropagation(); return; }
      if (historyOpen) { setHistoryOpen(false); e.preventDefault(); e.stopPropagation(); return; }
    }
    // 引擎模式：上/下方向键快速切换搜索引擎
    if (mode === 'engine' && engines.length > 0 && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const curIdx = selectedEngine ? engines.findIndex(en => en.id === selectedEngine.id) : -1;
      let nextIdx: number;
      if (curIdx < 0) {
        nextIdx = e.key === 'ArrowDown' ? 0 : engines.length - 1;
      } else {
        nextIdx = e.key === 'ArrowDown'
          ? (curIdx + 1) % engines.length
          : (curIdx - 1 + engines.length) % engines.length;
      }
      const engine = engines[nextIdx]!;
      setSelectedEngine(engine);
      saveLastEngineId(engine.id).catch(() => {});
      previewEngineDropdown();
      return;
    }
  };

  // 过滤历史记录（引擎模式输入时按内容过滤）
  const filteredHistory = mode === 'engine' && engineQuery.trim()
    ? history.filter(h => h.toLowerCase().includes(engineQuery.trim().toLowerCase()))
    : history;

  const showHistoryDropdown = mode === 'engine' && historyOpen && !engineDropdownOpen && filteredHistory.length > 0;

  const placeholder = mode === 'bookmark'
    ? '搜索书签…'
    : `使用 ${selectedEngine?.name ?? '搜索引擎'} 搜索，回车打开`;

  return (
    <div className="search-bar">
      <div className={`search-bar-inner${focused ? ' search-bar-inner--focused' : ''}`}>
        <div
          className="search-bar-engine-trigger"
          onMouseEnter={openEngineDropdown}
          onMouseLeave={closeEngineDropdown}
        >
          {mode === 'engine' && selectedEngine
            ? <FaviconImg url={selectedEngine.iconUrl ?? selectedEngine.searchUrl} />
            : BOOKMARK_SEARCH_ICON}
        </div>
        <input
          ref={inputRef}
          className="search-bar-input"
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={e => handleInputChange(e.target.value)}
          onFocus={() => { setFocused(true); if (mode === 'engine') openHistory(); }}
          onBlur={() => { setFocused(false); closeHistory(); }}
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
          <span className="search-bar-hints">
            <span className="search-bar-hint">/</span>
            <span className="search-bar-hint">Tab</span>
          </span>
        )}
      </div>

      {/* 引擎 / 模式选择下拉 */}
      {engineDropdownOpen && (
        <div className="engine-dropdown-overlay" onMouseEnter={openEngineDropdown} onMouseLeave={closeEngineDropdown}>
          <div className="engine-dropdown">
            <button
              className={`engine-option${mode === 'bookmark' ? ' engine-option--active' : ''}`}
              title="书签搜索"
              onMouseDown={e => e.preventDefault()}
              onClick={() => { if (mode !== 'bookmark') switchToBookmark(); else setEngineDropdownOpen(false); }}
            >
              <span className="engine-option-icon">{BOOKMARK_SEARCH_ICON}</span>
              <span className="engine-option-name">书签搜索</span>
            </button>
            <div className="engine-dropdown-divider" />
            {engines.map(engine => (
              <button
                key={engine.id}
                className={`engine-option${mode === 'engine' && selectedEngine?.id === engine.id ? ' engine-option--active' : ''}`}
                title={engine.name}
                onMouseDown={e => e.preventDefault()}
                onClick={() => handleSelectEngine(engine)}
              >
                <span className="engine-option-icon">
                  <FaviconImg url={engine.iconUrl ?? engine.searchUrl} />
                </span>
                <span className="engine-option-name">{engine.name}</span>
              </button>
            ))}
            <div className="engine-dropdown-divider" />
            <button
              className="engine-option engine-option--settings"
              onMouseDown={e => e.preventDefault()}
              onClick={() => { setEngineDropdownOpen(false); onOpenEngineSettings(); }}
            >
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

      {/* 搜索历史下拉（仅引擎模式） */}
      {showHistoryDropdown && (
        <div className="search-history-dropdown">
          {filteredHistory.map((term, i) => (
            <button
              key={`${term}-${i}`}
              className="search-history-item"
              onMouseDown={e => e.preventDefault()}
              onClick={() => handleHistoryClick(term)}
            >
              <span className="search-history-icon">{HISTORY_ICON}</span>
              <span className="search-history-text">{term}</span>
            </button>
          ))}
          <div className="engine-dropdown-divider" />
          <button className="search-history-clear" onMouseDown={e => e.preventDefault()} onClick={handleClearHistory}>
            清除搜索历史
          </button>
        </div>
      )}
    </div>
  );
});
