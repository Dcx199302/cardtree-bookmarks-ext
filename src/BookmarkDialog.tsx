import { useState, useEffect, useRef, useMemo } from 'react';
import type { CardTreeNode } from '@xuchengdong/cardtree-react';
import type { BookmarkItem } from './bookmarks';

export interface DialogState {
  mode: 'add-bookmark' | 'edit-bookmark' | 'add-folder' | 'rename-folder' | 'move-bookmark' | 'batch-move';
  targetId: string;
  parentId: string;
  initialTitle?: string;
  initialUrl?: string;
  bookmarkId?: string;
  bookmarkTitle?: string;
  folders?: FolderOption[];
  bookmarkIds?: string[];
}

export interface FolderOption {
  id: string;
  label: string;
  depth: number;
}

interface BookmarkDialogProps {
  state: DialogState;
  onSave: (title: string, url?: string) => void;
  onMove?: (bookmarkId: string, sourceFolderId: string, targetFolderId: string) => void;
  onBatchMove?: (bookmarkIds: string[], targetFolderId: string) => void;
  onCancel: () => void;
}

const TITLES: Record<DialogState['mode'], string> = {
  'add-bookmark': '新建书签',
  'edit-bookmark': '编辑书签',
  'add-folder': '新建文件夹',
  'rename-folder': '重命名文件夹',
  'move-bookmark': '移动到文件夹',
  'batch-move': '批量移动书签',
};

export function buildFolderOptions(
  rootSections: { id: string; label: string }[],
  nodes: CardTreeNode<BookmarkItem[]>[],
  excludeFolderId?: string,
): FolderOption[] {
  const options: FolderOption[] = [];
  for (const s of rootSections) {
    options.push({ id: s.id, label: s.label, depth: 0 });
  }
  function walk(ns: CardTreeNode<BookmarkItem[]>[], depth: number) {
    for (const n of ns) {
      if (n.id !== excludeFolderId) {
        options.push({ id: n.id, label: n.label, depth });
      }
      if (n.children.length > 0) walk(n.children, depth + 1);
    }
  }
  walk(nodes, 1);
  return options;
}

export function BookmarkDialog({ state, onSave, onMove, onBatchMove, onCancel }: BookmarkDialogProps) {
  const isBookmark = state.mode === 'add-bookmark' || state.mode === 'edit-bookmark';
  const isMove = state.mode === 'move-bookmark';
  const isBatchMove = state.mode === 'batch-move';
  const isFolderPicker = isMove || isBatchMove;
  const [title, setTitle] = useState(state.initialTitle ?? '');
  const [url, setUrl] = useState(state.initialUrl ?? '');
  const [selectedFolder, setSelectedFolder] = useState('');
  const [search, setSearch] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isFolderPicker) return;
    titleRef.current?.focus();
  }, []);

  const validUrl = !isBookmark || /^https?:\/\/.+/.test(url);
  const canSave = isFolderPicker ? !!selectedFolder : (title.trim() && (!isBookmark || url.trim()) && validUrl);

  const handleSave = () => {
    if (!canSave) return;
    if (isBatchMove && onBatchMove && state.bookmarkIds && selectedFolder) {
      onBatchMove(state.bookmarkIds, selectedFolder);
    } else if (isMove && onMove && state.bookmarkId && selectedFolder) {
      onMove(state.bookmarkId, state.parentId, selectedFolder);
    } else {
      onSave(title.trim(), isBookmark ? url.trim() : undefined);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSave(); }
    else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
  };

  const filteredFolders = useMemo(() => {
    if (!state.folders) return [];
    if (!search) return state.folders;
    const q = search.toLowerCase();
    return state.folders.filter(f => f.label.toLowerCase().includes(q));
  }, [state.folders, search]);

  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div className="dialog-card" onClick={e => e.stopPropagation()}>
        <h3 className="dialog-title">
          {isBatchMove ? `移动 ${state.bookmarkIds?.length ?? 0} 个书签` : isMove ? `移动「${state.bookmarkTitle ?? ''}」` : TITLES[state.mode]}
        </h3>

        {isFolderPicker ? (
          <>
            <div className="dialog-field">
              <input
                ref={titleRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="搜索文件夹…"
              />
            </div>
            <div className="dialog-folder-list" ref={listRef}>
              {filteredFolders.map(f => (
                <button
                  key={f.id}
                  data-folder-id={f.id}
                  className={`dialog-folder-item${selectedFolder === f.id ? ' dialog-folder-item--selected' : ''}`}
                  style={{ paddingLeft: 12 + f.depth * 16 }}
                  onClick={() => setSelectedFolder(f.id)}
                  onDoubleClick={() => { setSelectedFolder(f.id); handleSave(); }}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                    <path d="M1.5 3.5A1 1 0 0 1 2.5 2.5h3.586a1 1 0 0 1 .707.293L8.207 4.5H13.5a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-9z" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="0.8" />
                  </svg>
                  <span>{f.label}</span>
                </button>
              ))}
              {filteredFolders.length === 0 && (
                <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>无匹配文件夹</div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="dialog-field">
              <label>名称</label>
              <input ref={titleRef} value={title} onChange={e => setTitle(e.target.value)} onKeyDown={handleKeyDown} />
            </div>
            {isBookmark && (
              <div className="dialog-field">
                <label>URL</label>
                <input value={url} placeholder="https://" onChange={e => setUrl(e.target.value)} onKeyDown={handleKeyDown} />
              </div>
            )}
          </>
        )}

        <div className="dialog-actions">
          <button className="dialog-btn dialog-btn--cancel" onClick={onCancel}>取消</button>
          <button className="dialog-btn dialog-btn--primary" disabled={!canSave} onClick={handleSave}>
            {isFolderPicker ? '移动' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
