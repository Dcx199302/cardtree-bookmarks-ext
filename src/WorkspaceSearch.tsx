import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { buildSearchUrl, type SearchEngine } from './searchEnginesStore';
import { addSearchHistory, loadLastEngineId, saveLastEngineId } from './searchHistoryStore';
import { FaviconImg } from './FaviconImg';

interface WorkspaceSearchProps {
  engines: SearchEngine[];
  onOpenEngineSettings: () => void;
}

export function WorkspaceSearch({ engines, onOpenEngineSettings }: WorkspaceSearchProps) {
  const [query, setQuery] = useState('');
  const [selectedEngineId, setSelectedEngineId] = useState<string | null>(null);

  useEffect(() => {
    loadLastEngineId().then(id => setSelectedEngineId(id)).catch(() => {});
  }, []);

  useEffect(() => {
    if (engines.length === 0) return;
    const exists = engines.some(engine => engine.id === selectedEngineId);
    if (exists) return;
    const first = engines[0]!;
    setSelectedEngineId(first.id);
    saveLastEngineId(first.id).catch(() => {});
  }, [engines, selectedEngineId]);

  const selectedEngine = useMemo(
    () => engines.find(engine => engine.id === selectedEngineId) ?? engines[0],
    [engines, selectedEngineId],
  );

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedEngine) return;
    const q = query.trim();
    // 空关键词时打开当前搜索引擎首页，避免按钮出现不可用状态。
    window.open(buildSearchUrl(selectedEngine, q), '_blank', 'noopener,noreferrer');
    if (q) addSearchHistory(q).catch(() => {});
  };

  return (
    <section className="workspace-search" aria-label="工作台搜索">
      <form className="workspace-search__form" onSubmit={handleSubmit}>
        <span className="workspace-search__current-engine" title={selectedEngine?.name}>
          {selectedEngine
            ? <FaviconImg url={selectedEngine.iconUrl ?? selectedEngine.searchUrl} />
            : (
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" strokeWidth="1.8" />
                  <path d="M16.5 16.5L21 21" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              )}
        </span>
        <input
          type="text"
          value={query}
          placeholder="搜索…"
          aria-label="工作台搜索"
          onChange={event => setQuery(event.target.value)}
        />
        <button type="submit" aria-label="搜索或打开搜索引擎" title="搜索或打开搜索引擎">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 12h13M13 6l6 6-6 6" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </form>
      <div className="workspace-search__engines" role="group" aria-label="切换搜索引擎">
        {engines.map(engine => {
          const active = engine.id === selectedEngine?.id;
          return (
            <button
              key={engine.id}
              type="button"
              className={`workspace-search__engine${active ? ' workspace-search__engine--active' : ''}`}
              onClick={() => {
                setSelectedEngineId(engine.id);
                saveLastEngineId(engine.id).catch(() => {});
              }}
              aria-pressed={active}
              title={engine.name}
            >
              <span className="workspace-search__engine-icon"><FaviconImg url={engine.iconUrl ?? engine.searchUrl} /></span>
              <span className="workspace-search__engine-name">{engine.name}</span>
            </button>
          );
        })}
        <button
          type="button"
          className="workspace-search__engine-settings"
          onClick={onOpenEngineSettings}
          aria-label="引擎管理"
          title="引擎管理"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="3" strokeWidth="1.7" />
            <path
              d="M19.2 14.4a1.6 1.6 0 0 0 .32 1.77l.06.06a1.94 1.94 0 1 1-2.75 2.75l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-.97 1.47v.17a1.94 1.94 0 0 1-3.88 0v-.09a1.6 1.6 0 0 0-1.05-1.47 1.6 1.6 0 0 0-1.77.32l-.06.06a1.94 1.94 0 1 1-2.75-2.75l.06-.06a1.6 1.6 0 0 0 .32-1.77 1.6 1.6 0 0 0-1.47-.97H3.9a1.94 1.94 0 0 1 0-3.88h.09A1.6 1.6 0 0 0 5.46 8.5a1.6 1.6 0 0 0-.32-1.77l-.06-.06A1.94 1.94 0 1 1 7.83 3.92l.06.06a1.6 1.6 0 0 0 1.77.32h.08a1.6 1.6 0 0 0 .97-1.47V2.7a1.94 1.94 0 0 1 3.88 0v.09a1.6 1.6 0 0 0 .97 1.47 1.6 1.6 0 0 0 1.77-.32l.06-.06a1.94 1.94 0 1 1 2.75 2.75l-.06.06a1.6 1.6 0 0 0-.32 1.77v.08a1.6 1.6 0 0 0 1.47.97h.17a1.94 1.94 0 0 1 0 3.88h-.09a1.6 1.6 0 0 0-1.47.97z"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </section>
  );
}
