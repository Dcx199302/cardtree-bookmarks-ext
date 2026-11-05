import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { createSavedTabItem, createTabCollection, loadTabCollections, saveTabCollections, MAX_COLLECTIONS, MAX_TABS_PER_COLLECTION, type TabCollection } from './tabCollectionStore';
import { FaviconImg } from './FaviconImg';

interface IconButtonProps {
  label: string;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
}

function IconButton({ label, onClick, children, className = '', disabled, type = 'button' }: IconButtonProps) {
  return (
    <button
      type={type}
      className={`workspace-icon-button${className ? ` ${className}` : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}

export function TabCollectionCard() {
  const [collections, setCollections] = useState<TabCollection[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingCollectionId, setEditingCollectionId] = useState<string | null>(null);
  const [collectionDraft, setCollectionDraft] = useState('');
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [tabDraft, setTabDraft] = useState('');
  const [addingGroupId, setAddingGroupId] = useState<string | null>(null);
  const [newTabTitle, setNewTabTitle] = useState('');
  const [newTabUrl, setNewTabUrl] = useState('');

  useEffect(() => {
    loadTabCollections().then(setCollections).catch(() => setError('标签存档读取失败'));
  }, []);

  useEffect(() => {
    if (collections.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!collections.some(collection => collection.id === selectedId)) {
      setSelectedId(collections[0]!.id);
    }
  }, [collections, selectedId]);

  const selectedCollection = collections.find(collection => collection.id === selectedId) ?? null;

  const commit = (next: TabCollection[]) => {
    setCollections(next);
    saveTabCollections(next).catch(() => setError('标签存档保存失败'));
  };

  const selectCollection = (id: string) => {
    setSelectedId(id);
    setEditingCollectionId(null);
    setEditingTabId(null);
    setAddingGroupId(null);
    setNewTabTitle('');
    setNewTabUrl('');
  };

  const collectTabs = async () => {
    setError(null);
    setCollecting(true);
    try {
      const currentTab = await chrome.tabs.getCurrent();
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const candidates = tabs
        .filter(tab =>
          tab.id != null
          && tab.id !== currentTab?.id
          && typeof tab.url === 'string'
          && tab.url.length > 0)
        .slice(0, MAX_TABS_PER_COLLECTION);

      if (candidates.length === 0) {
        setError('当前窗口没有其他可存档的标签页');
        return;
      }

      const collection = createTabCollection(
        `${candidates.length} 个标签页`,
        candidates.map(tab => ({
          title: tab.title || tab.url || '未命名标签',
          url: tab.url || '',
        })),
      );
      const next = [collection, ...collections].slice(0, MAX_COLLECTIONS);
      await saveTabCollections(next);
      setCollections(next);
      setSelectedId(collection.id);
      setEditingCollectionId(null);
      setEditingTabId(null);
      setAddingGroupId(null);
    } catch (collectError) {
      setError(collectError instanceof Error ? collectError.message : '标签存档失败');
    } finally {
      setCollecting(false);
    }
  };

  const renameCollection = (id: string) => {
    const next = collections.map(collection => collection.id === id
      ? { ...collection, title: collectionDraft.trim() || collection.title }
      : collection);
    commit(next);
    setEditingCollectionId(null);
  };

  const deleteCollection = (id: string) => {
    commit(collections.filter(collection => collection.id !== id));
    if (addingGroupId === id) {
      setAddingGroupId(null);
      setNewTabTitle('');
      setNewTabUrl('');
    }
  };

  const openAll = async (collection: TabCollection) => {
    await Promise.all(collection.tabs.map(tab => chrome.tabs.create({ url: tab.url, active: false })));
  };

  const removeTab = (collectionId: string, tabId: string) => {
    commit(collections.map(collection => collection.id === collectionId
      ? { ...collection, tabs: collection.tabs.filter(tab => tab.id !== tabId) }
      : collection));
    if (editingTabId === tabId) {
      setEditingTabId(null);
      setTabDraft('');
    }
  };

  const saveTabTitle = (collectionId: string, tabId: string) => {
    commit(collections.map(collection => collection.id === collectionId
      ? {
        ...collection,
        tabs: collection.tabs.map(tab => tab.id === tabId
          ? { ...tab, title: tabDraft.trim() || tab.title }
          : tab),
      }
      : collection));
    setEditingTabId(null);
    setTabDraft('');
  };

  const addTab = (collectionId: string) => {
    try {
      const item = createSavedTabItem(newTabTitle, newTabUrl);
      commit(collections.map(collection => collection.id === collectionId
        ? { ...collection, tabs: [...collection.tabs, item] }
        : collection));
      setNewTabTitle('');
      setNewTabUrl('');
      setAddingGroupId(null);
      setError(null);
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : '添加链接失败');
    }
  };

  const addingTab = selectedCollection != null && addingGroupId === selectedCollection.id;

  return (
    <section className="workspace-panel workspace-panel--tabs" aria-labelledby="workspace-tabs-title">
      <header className="workspace-panel__header workspace-panel__header--tabs">
        <div className="workspace-panel__heading">
          <h2 id="workspace-tabs-title" className="workspace-panel-title">标签存档</h2>
        </div>
        <button type="button" className="workspace-primary-button" onClick={() => void collectTabs()} disabled={collecting}>
          {collecting ? '存档中...' : '一键存档'}
        </button>
      </header>

      <div className="workspace-tab-body">
        <div className="workspace-tab-detail">
          {selectedCollection ? (
            <article className="workspace-tab-group">
              <header className="workspace-tab-group__header">
                {editingCollectionId === selectedCollection.id ? (
                  <>
                    <input
                      value={collectionDraft}
                      autoFocus
                      aria-label="编辑存档名称"
                      onChange={event => setCollectionDraft(event.target.value)}
                      onKeyDown={event => {
                        if (event.key === 'Enter') renameCollection(selectedCollection.id);
                        if (event.key === 'Escape') setEditingCollectionId(null);
                      }}
                    />
                    <span className="workspace-tab-group__actions">
                      <IconButton label="保存存档名称" onClick={() => renameCollection(selectedCollection.id)} disabled={!collectionDraft.trim()}>
                        <path d="M5 13l4 4L19 7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                      </IconButton>
                      <IconButton label="取消编辑存档名称" onClick={() => setEditingCollectionId(null)}>
                        <path d="M6 6l12 12M18 6L6 18" strokeWidth="2.2" strokeLinecap="round" />
                      </IconButton>
                    </span>
                  </>
                ) : (
                  <>
                    <div>
                      <h3>{selectedCollection.title}</h3>
                      <span>
                        {selectedCollection.tabs.length} 个链接 · {new Date(selectedCollection.createdAt).toLocaleString('zh-CN', {
                          month: 'numeric',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <span className="workspace-tab-group__actions">
                      <IconButton label="全部打开" onClick={() => void openAll(selectedCollection)}>
                        <path d="M14 4h6v6M20 4l-8 8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </IconButton>
                      <IconButton label="重命名存档" onClick={() => {
                        setEditingCollectionId(selectedCollection.id);
                        setCollectionDraft(selectedCollection.title);
                      }}>
                        <path d="M4 20h4L19 9l-4-4L4 16v4z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </IconButton>
                      <IconButton label="删除存档" className="workspace-danger-button" onClick={() => deleteCollection(selectedCollection.id)}>
                        <path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </IconButton>
                    </span>
                  </>
                )}
              </header>

              <ul>
                {selectedCollection.tabs.map(tab => {
                  const editingTab = editingTabId === tab.id;
                  return (
                    <li key={tab.id} className={editingTab ? 'workspace-tab-group__item--editing' : undefined}>
                      {editingTab ? (
                        <>
                          <input
                            value={tabDraft}
                            autoFocus
                            aria-label="编辑链接名称"
                            onChange={event => setTabDraft(event.target.value)}
                            onKeyDown={event => {
                              if (event.key === 'Enter') saveTabTitle(selectedCollection.id, tab.id);
                              if (event.key === 'Escape') setEditingTabId(null);
                            }}
                          />
                          <span className="workspace-tab-item__actions workspace-tab-item__actions--visible">
                            <IconButton label="保存链接名称" onClick={() => saveTabTitle(selectedCollection.id, tab.id)} disabled={!tabDraft.trim()}>
                              <path d="M5 13l4 4L19 7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                            </IconButton>
                            <IconButton label="取消编辑链接名称" onClick={() => setEditingTabId(null)}>
                              <path d="M6 6l12 12M18 6L6 18" strokeWidth="2.2" strokeLinecap="round" />
                            </IconButton>
                          </span>
                        </>
                      ) : (
                        <>
                          <FaviconImg url={tab.url} />
                          <a href={tab.url} target="_blank" rel="noopener noreferrer">
                            <span>{tab.title}</span>
                            <small>{(() => {
                              try { return new URL(tab.url).hostname; } catch { return tab.url; }
                            })()}</small>
                          </a>
                          <span className="workspace-tab-item__actions">
                            <IconButton label={`编辑 ${tab.title}`} onClick={() => {
                              setEditingTabId(tab.id);
                              setTabDraft(tab.title);
                            }}>
                              <path d="M4 20h4L19 9l-4-4L4 16v4z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </IconButton>
                            <IconButton label={`删除 ${tab.title}`} className="workspace-danger-button" onClick={() => removeTab(selectedCollection.id, tab.id)}>
                              <path d="M6 6l12 12M18 6L6 18" strokeWidth="2.2" strokeLinecap="round" />
                            </IconButton>
                          </span>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>

              {addingTab ? (
                <form className="workspace-tab-add" onSubmit={(event: FormEvent) => {
                  event.preventDefault();
                  addTab(selectedCollection.id);
                }}>
                  <input value={newTabTitle} placeholder="名称（可选）" aria-label="链接名称" onChange={event => setNewTabTitle(event.target.value)} />
                  <input value={newTabUrl} placeholder="https://..." required aria-label="链接地址" onChange={event => setNewTabUrl(event.target.value)} />
                  <IconButton label="添加链接" type="submit" disabled={!newTabUrl.trim()}>
                    <path d="M5 13l4 4L19 7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </IconButton>
                  <IconButton label="取消添加链接" onClick={() => setAddingGroupId(null)}>
                    <path d="M6 6l12 12M18 6L6 18" strokeWidth="2.2" strokeLinecap="round" />
                  </IconButton>
                </form>
              ) : (
                <IconButton
                  label="添加链接"
                  className="workspace-tab-add-button"
                  onClick={() => {
                    setAddingGroupId(selectedCollection.id);
                    setNewTabTitle('');
                    setNewTabUrl('');
                  }}
                >
                  <path d="M12 5v14M5 12h14" strokeWidth="2" strokeLinecap="round" />
                </IconButton>
              )}
            </article>
          ) : (
            <div className="workspace-empty-panel">还没有标签存档</div>
          )}
        </div>

        <TabCollectionNav
          collections={collections}
          selectedCollection={selectedCollection}
          onSelect={selectCollection}
        />
      </div>

      {error && <p className="workspace-error">{error}</p>}

    </section>
  );
}

interface TabCollectionNavProps {
  collections: TabCollection[];
  selectedCollection: TabCollection | null;
  onSelect: (id: string) => void;
}

/** 标签存档面板内部的右侧列表，与详情区域共同组成一个卡片。 */
function TabCollectionNav({ collections, selectedCollection, onSelect }: TabCollectionNavProps) {
  return (
    <nav className="workspace-tab-nav" aria-label="标签存档列表">
      <div className="workspace-tab-nav__list">
          {collections.map(collection => {
            const active = collection.id === selectedCollection?.id;
            return (
              <button
                key={collection.id}
                type="button"
                className={`workspace-tab-nav__item${active ? ' workspace-tab-nav__item--active' : ''}`}
                onClick={() => onSelect(collection.id)}
                aria-current={active ? 'true' : undefined}
                title={collection.title}
              >
                <span className="workspace-tab-nav__title">{collection.title}</span>
                <span className="workspace-tab-nav__count">{collection.tabs.length}</span>
              </button>
            );
          })}
        {collections.length === 0 && <span className="workspace-tab-nav__empty">暂无存档</span>}
      </div>
    </nav>
  );
}
