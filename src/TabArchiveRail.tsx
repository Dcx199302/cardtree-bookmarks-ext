import { useEffect, useState, type FormEvent } from 'react';
import {
  createTabCollection,
  loadTabCollections,
  TAB_COLLECTIONS_STORAGE_KEY,
  MAX_COLLECTIONS,
  MAX_TAB_TITLE_LENGTH,
  MAX_TABS_PER_COLLECTION,
  saveTabCollections,
  type TabCollection,
} from './tabCollectionStore';
import { FaviconImg } from './FaviconImg';
import { UtilityDialog } from './UtilityDialog';
import { WorkspaceIconButton } from './WorkspaceIconButton';

interface BrowserTabCandidate {
  id: string;
  title: string;
  url: string;
  selected: boolean;
}

type TabDialogState =
  | { kind: 'create'; title: string; candidates: BrowserTabCandidate[]; loading: boolean; error: string | null }
  | { kind: 'view'; collectionId: string; title: string; confirmingDelete: boolean };

const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function formatTime(timestamp: number): string {
  return dateTimeFormatter.format(new Date(timestamp));
}

function getHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function TabArchiveRail() {
  const [collections, setCollections] = useState<TabCollection[]>([]);
  const [dialog, setDialog] = useState<TabDialogState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadTabCollections().then(next => {
      if (active) setCollections(next);
    }).catch(() => {
      if (active) setError('标签存档读取失败');
    });
    return () => {
      active = false;
    };
  }, []);

  // 存储写入可能是异步回写；监听变化保证列表始终以本地存储为准。
  useEffect(() => {
    let active = true;
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local' || !changes[TAB_COLLECTIONS_STORAGE_KEY]) return;
      loadTabCollections().then(next => {
        if (active) setCollections(next);
      }).catch(() => undefined);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => {
      active = false;
      chrome.storage.onChanged.removeListener(listener);
    };
  }, []);

  const viewingCollection = dialog?.kind === 'view'
    ? collections.find(collection => collection.id === dialog.collectionId) ?? null
    : null;
  const selectedCount = dialog?.kind === 'create'
    ? dialog.candidates.filter(candidate => candidate.selected).length
    : 0;

  const commit = (next: TabCollection[]) => {
    setCollections(next);
    saveTabCollections(next).catch(() => setError('标签存档保存失败'));
  };

  const openCreateDialog = async () => {
    setError(null);
    setDialog({ kind: 'create', title: '', candidates: [], loading: true, error: null });
    try {
      const [currentTab, tabs] = await Promise.all([
        chrome.tabs.getCurrent(),
        chrome.tabs.query({ currentWindow: true }),
      ]);
      const candidates = tabs
        .filter(tab => tab.id != null && tab.id !== currentTab?.id && typeof tab.url === 'string' && tab.url.length > 0)
        .map(tab => ({
          id: String(tab.id),
          title: tab.title || tab.url || '未命名标签',
          url: tab.url || '',
          selected: true,
        })).slice(0, MAX_TABS_PER_COLLECTION);
      setDialog(prev => prev?.kind === 'create'
        ? {
          kind: 'create',
          title: `${candidates.length} 个标签页`,
          candidates,
          loading: false,
          error: candidates.length === 0 ? '当前窗口没有其他可存档的标签页' : null,
        }
        : prev);
    } catch (loadError) {
      setDialog(prev => prev?.kind === 'create'
        ? {
          kind: 'create',
          title: '',
          candidates: [],
          loading: false,
          error: loadError instanceof Error ? loadError.message : '标签页读取失败',
        }
        : prev);
    }
  };

  const toggleCandidate = (id: string, selected: boolean) => {
    setDialog(prev => {
      if (prev?.kind !== 'create') return prev;
      const candidates = prev.candidates.map(candidate => candidate.id === id
        ? { ...candidate, selected }
        : candidate);
      return { ...prev, candidates };
    });
  };

  const toggleAllCandidates = (selected: boolean) => {
    setDialog(prev => {
      if (prev?.kind !== 'create') return prev;
      return {
        ...prev,
        candidates: prev.candidates.map(candidate => ({ ...candidate, selected })),
      };
    });
  };

  const saveCollection = async (event: FormEvent) => {
    event.preventDefault();
    if (dialog?.kind !== 'create') return;
    const selectedTabs = dialog.candidates.filter(candidate => candidate.selected);
    setSaving(true);
    try {
      const collection = createTabCollection(
        dialog.title,
        selectedTabs.map(candidate => ({ title: candidate.title, url: candidate.url })),
      );
      const next = [collection, ...collections].slice(0, MAX_COLLECTIONS);
      await saveTabCollections(next);
      setCollections(next);
      setDialog(null);
      setError(null);
    } catch (saveError) {
      setDialog({ ...dialog, error: saveError instanceof Error ? saveError.message : '标签存档保存失败' });
    } finally {
      setSaving(false);
    }
  };

  const renameCollection = (event: FormEvent) => {
    event.preventDefault();
    if (dialog?.kind !== 'view' || !viewingCollection) return;
    commit(collections.map(collection => collection.id === viewingCollection.id
      ? { ...collection, title: dialog.title.trim() || collection.title }
      : collection));
    setDialog(null);
  };

  const removeCollection = () => {
    if (dialog?.kind !== 'view' || !viewingCollection) return;
    if (!dialog.confirmingDelete) {
      setDialog({ ...dialog, confirmingDelete: true });
      return;
    }
    commit(collections.filter(collection => collection.id !== viewingCollection.id));
    setDialog(null);
  };

  const openAllTabs = (collection: TabCollection) => {
    void Promise.all(collection.tabs.map(tab => chrome.tabs.create({ url: tab.url, active: false })));
  };

  return (
    <section className="utility-rail__section" aria-label="标签存档">
      <header className="utility-rail__header">
        <h2>标签存档</h2>
        <span className="utility-rail__actions">
          <WorkspaceIconButton label="新增标签存档" onClick={() => void openCreateDialog()}>
            <path d="M12 5v14M5 12h14" strokeWidth="2" strokeLinecap="round" />
          </WorkspaceIconButton>
        </span>
      </header>

      <div className="utility-rail__list">
        {collections.length > 0 ? collections.map(collection => (
          <div key={collection.id} className="utility-rail__row-wrap">
            <button
              type="button"
              className="utility-rail__row"
              onClick={() => setDialog({
                kind: 'view',
                collectionId: collection.id,
                title: collection.title,
                confirmingDelete: false,
              })}
            >
              <strong>{collection.title}</strong>
              <span>{collection.tabs.length} 个链接 · {formatTime(collection.createdAt)}</span>
            </button>
            <WorkspaceIconButton
              className="utility-rail__row-action"
              label={`打开 ${collection.title}`}
              onClick={() => openAllTabs(collection)}
            >
              <path d="M8 16 16 8" />
              <path d="M9 8h7v7" />
            </WorkspaceIconButton>
          </div>
        )) : (
          <div className="utility-rail__empty">{error ?? '点击右上角新增存档'}</div>
        )}
      </div>

      {dialog?.kind === 'create' && (
        <UtilityDialog
          title="新增标签存档"
          description={`已选择 ${selectedCount}/${dialog.candidates.length} 个标签页`}
          onClose={() => setDialog(null)}
          className="utility-dialog--tabs"
        >
          <form onSubmit={saveCollection}>
            <div className="utility-dialog__create-bar">
              <label className="utility-dialog__select-all" title="全选标签页">
                <input
                  type="checkbox"
                  aria-label="全选标签页"
                  checked={selectedCount === dialog.candidates.length}
                  ref={input => {
                    if (input) {
                      input.indeterminate = selectedCount > 0 && selectedCount < dialog.candidates.length;
                    }
                  }}
                  onChange={event => toggleAllCandidates(event.target.checked)}
                />
              </label>
              <input
                type="text"
                value={dialog.title}
                maxLength={MAX_TAB_TITLE_LENGTH}
                placeholder="标题"
                aria-label="存档标题"
                autoFocus
                onChange={event => setDialog({ ...dialog, title: event.target.value })}
              />
              <button
                type="submit"
                className="dialog-btn dialog-btn--primary utility-dialog__inline-save"
                disabled={saving || dialog.loading || selectedCount === 0}
              >
                {saving ? '保存中…' : '保存存档'}
              </button>
            </div>
            {dialog.loading ? (
              <div className="utility-dialog__empty">正在读取标签页…</div>
            ) : dialog.candidates.length > 0 ? (
              <>
                <div className="utility-dialog__list">
                  {dialog.candidates.map(candidate => (
                    <label key={candidate.id} className="utility-dialog__tab-row">
                      <input
                        type="checkbox"
                        checked={candidate.selected}
                        onChange={event => toggleCandidate(candidate.id, event.target.checked)}
                      />
                      <FaviconImg url={candidate.url} />
                      <span>
                        <strong>{candidate.title}</strong>
                        <small>{getHost(candidate.url)}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </>
            ) : (
              <div className="utility-dialog__empty">没有可保存的标签页</div>
            )}
            {dialog.error && <p className="utility-dialog__error" role="alert">{dialog.error}</p>}
          </form>
        </UtilityDialog>
      )}

      {dialog?.kind === 'view' && viewingCollection && (
        <UtilityDialog
          title="查看标签存档"
          description={`${viewingCollection.tabs.length} 个链接 · ${formatTime(viewingCollection.createdAt)}`}
          onClose={() => setDialog(null)}
          className="utility-dialog--tabs"
        >
          <form onSubmit={renameCollection}>
            <label className="utility-dialog__field">
              存档标题
              <input
                value={dialog.title}
                maxLength={MAX_TAB_TITLE_LENGTH}
                autoFocus
                onChange={event => setDialog({ ...dialog, title: event.target.value })}
              />
            </label>
            <div className="utility-dialog__list">
              {viewingCollection.tabs.map(tab => (
                <a key={tab.id} className="utility-dialog__tab-row" href={tab.url} target="_blank" rel="noopener noreferrer">
                  <FaviconImg url={tab.url} />
                  <span>
                    <strong>{tab.title}</strong>
                    <small>{getHost(tab.url)}</small>
                  </span>
                </a>
              ))}
            </div>
            {error && <p className="utility-dialog__error" role="alert">{error}</p>}
            <footer className="utility-dialog__footer">
              <button type="button" className="dialog-btn dialog-btn--cancel" onClick={() => setDialog(null)}>取消</button>
              <button type="button" className="utility-dialog__open-button" onClick={() => openAllTabs(viewingCollection)}>
                全部打开
              </button>
              <button
                type="button"
                className={dialog.confirmingDelete ? 'utility-dialog__confirm-delete' : 'utility-dialog__delete-button'}
                onClick={removeCollection}
              >
                {dialog.confirmingDelete ? '确认删除' : '删除'}
              </button>
              <button type="submit" className="dialog-btn dialog-btn--primary">保存</button>
            </footer>
          </form>
        </UtilityDialog>
      )}
    </section>
  );
}
