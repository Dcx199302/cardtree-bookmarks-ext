import { StrictMode, useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { Subject, fromEvent, merge, animationFrameScheduler, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged, filter, take, throttleTime } from 'rxjs/operators';
import { CardTree } from '@xuchengdong/cardtree-react';
import type { CardTreeRef, CardTreeNode, DragDropConfig } from '@xuchengdong/cardtree-react';
import { loadBookmarkTree } from './bookmarks';
import type { BookmarkItem } from './bookmarks';
import { deleteBookmark, deleteFolder, moveBookmark } from './bookmarkActions';
import { loadTrash, addToTrash, removeFromTrash, clearTrash, resolveRestoreParent, validateTrashParents, groupTrashByDate, type TrashItem } from './trashStore';
import { recordVisit } from './visitTracker';
import { SearchBar, type SearchBarRef } from './SearchBar';
import { ContextMenu, type MenuItem } from './ContextMenu';
import { BookmarkDialog, type DialogState, buildFolderOptions } from './BookmarkDialog';
import NavRail from './NavRail';
import type { NavItem } from './NavRail';
import { loadFolderDisplaySettings, setFolderDisplaySize, cleanupOrphanedSettings, loadCollapsedIds, saveCollapsedIds, loadNavRailOrder, saveNavRailOrder, type FolderDisplaySizeSettings, type NavRailOrder } from './folderDisplaySettings';
import { MenuContext, type BookmarkPointerDragStart, type ActiveBookmarkDrag, type RubberBandState } from './menuContextTypes';
import { findBookmarkFolderId, findNodeInTree, addBookmarkToNodes, updateBookmarkInNodes, removeBookmarkFromNodes, addFolderToNodes, renameFolderInNodes, removeFolderFromNodes, filterTree, toggleSelection, rangeSelect, withBookmarkData, findAndUpdateNode } from './bookmarkTreeHelpers';
import { clampIndex, findDropTarget, resolveChromeInsertIndex, captureBookmarkItemRects, animateBookmarkItemReflow, applyBookmarkFlip, animateFlyIn, TOOLTIP_SHOW_DELAY_MS, measureTextWidth } from './bookmarkDragDom';
import { useTheme } from './useTheme';
import { ConfirmDialog } from './ConfirmDialog';
import { loadSearchEngines, saveSearchEngines, type SearchEngine, MAX_VISIBLE } from './searchEnginesStore';
import { SearchEngineSettingsDialog } from './SearchEngineSettingsDialog';
import { FloatingBookmarkGhost, RubberBandOverlay } from './bookmarkDragUI';
import { BookmarkFolderCard, RootBookmarksCard } from './BookmarkDropZone';
import '@xuchengdong/cardtree-react/styles/cascade.css';
import './newtab.css';


// ── Trash Panel ──

function TrashPanel({ items, parentValidMap, parentTitleMap, toast, onRestore, onDelete, onClear, onClose }: {
  items: TrashItem[];
  parentValidMap: Map<string, boolean>;
  parentTitleMap: Map<string, string>;
  toast: { text: string; isWarning: boolean } | null;
  onRestore: (item: TrashItem) => void;
  onDelete: (ids: string[]) => Promise<void>;
  onClear: () => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const filtered = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter(i => i.title.toLowerCase().includes(q) || i.url.toLowerCase().includes(q));
  }, [items, search]);

  const groups = useMemo(() => groupTrashByDate(filtered), [filtered]);

  return (
    <div ref={panelRef} className="trash-panel">
      <div className="trash-panel__header">
        <span className="trash-panel__title">回收站 ({items.length})</span>
        {items.length > 0 && <button className="trash-panel__clear" onClick={onClear}>清空</button>}
      </div>
      {items.length > 5 && (
        <div className="trash-panel__search-wrap">
          <input
            className="trash-panel__search"
            type="text"
            placeholder="搜索…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      )}
      <div className="trash-panel__list">
        {groups.length === 0 ? (
          <div className="trash-panel__empty">{search ? '无匹配项' : '回收站为空'}</div>
        ) : groups.map(group => (
          <div key={group.label}>
            <div className="trash-panel__group-label">{group.label}</div>
            {group.items.map(item => {
              const parentValid = parentValidMap.get(item.parentId) ?? true;
              const currentTitle = parentTitleMap.get(item.parentId) ?? item.parentTitle;
              return (
                <div key={`${item.id}-${item.deletedAt}`} className="trash-panel__item">
                  <div className="trash-panel__item-info">
                    <span className="trash-panel__item-title">{item.title}</span>
                    <span className={`trash-panel__item-meta${!parentValid ? ' trash-panel__item-parent-deleted' : ''}`}>
                      {parentValid ? currentTitle || item.parentTitle : `${item.parentTitle}（已删除）`}
                    </span>
                  </div>
                  <div className="trash-panel__item-actions">
                    <button className="trash-panel__btn" onClick={() => onRestore(item)}>
                      {parentValid ? '恢复' : '恢复到书签栏'}
                    </button>
                    <button className="trash-panel__btn trash-panel__btn--danger" onClick={async () => { await onDelete([item.id]); }}>删除</button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {toast && (
        <div className={`trash-toast${toast.isWarning ? ' trash-toast--warning' : ''}`}>{toast.text}</div>
      )}
    </div>
  );
}

// ── Main Component ──

function NewTab() {
  const treeRef = useRef<CardTreeRef>(null);
  const searchRef = useRef<SearchBarRef>(null);
  const latestNodesRef = useRef<CardTreeNode<BookmarkItem[]>[]>([]);
  const pendingSelfMoveIdsRef = useRef(new Map<string, number>());
  const bookmarkDragStart$ = useRef(new Subject<BookmarkPointerDragStart>());
  const dragSessionRef = useRef<{ moveSub: Subscription; endSub: Subscription } | null>(null);
  const dropGhostTimerRef = useRef<number | null>(null);
  const tooltipTimerRef = useRef<number | null>(null);
  const dragPreviewRef = useRef<{ folderId: string; dropIndex: number } | null>(null);
  const pointerPositionRef = useRef<{ x: number; y: number } | null>(null);
  const suppressBookmarkClickUntilRef = useRef(0);
  const pendingDragFlipRef = useRef<Map<string, DOMRect> | null>(null);
  const bookmarkFolderMapRef = useRef<Map<string, string>>(new Map());
  const [nodes, setNodes] = useState<CardTreeNode<BookmarkItem[]>[]>([]);
  const [loading, setLoading] = useState(true);
  const [suppressAnim, setSuppressAnim] = useState(true);
  const [navRailOrder, setNavRailOrder] = useState<NavRailOrder>({});
  const [isBookmarkDragging, setIsBookmarkDragging] = useState(false);
  const [activeBookmarkDrag, setActiveBookmarkDrag] = useState<ActiveBookmarkDrag | null>(null);
  const [dragPreview, setDragPreviewState] = useState<{ folderId: string; dropIndex: number } | null>(null);
 const [dropGhost, setDropGhost] = useState<ActiveBookmarkDrag | null>(null);
  // 放置后 FLIP 动画的触发器：与 setNodes 同批提交，确保 useLayoutEffect
  // 在 DOM commit 后同步执行，元素已就位，animateFlyIn 不会因查不到节点而静默失败。
  const [pendingDropAnim, setPendingDropAnim] = useState<{
    flyIn: Array<{ id: string; origin: { left: number; top: number; width: number; height: number } }>;
    flipRects: Map<string, DOMRect>;
  } | null>(null);
 const [searchQuery, setSearchQuery] = useState('');
  const [menuState, setMenuState] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [dialogState, setDialogState] = useState<DialogState | null>(null);
  const [confirmState, setConfirmState] = useState<{ message: string; action: () => Promise<void> } | null>(null);
  const [tooltip, setTooltip] = useState<{ text: string; x: number; anchorTop: number; anchorBottom: number; placement: 'top' | 'bottom'; arrowX: number } | null>(null);
  const [displaySettings, setDisplaySettings] = useState<FolderDisplaySizeSettings>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const [rubberBand, setRubberBand] = useState<RubberBandState | null>(null);
  const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
  const [showTrash, setShowTrash] = useState(false);
  const [parentValidMap, setParentValidMap] = useState<Map<string, boolean>>(new Map());
  const [parentTitleMap, setParentTitleMap] = useState<Map<string, string>>(new Map());
  const [trashToast, setTrashToast] = useState<{ text: string; isWarning: boolean } | null>(null);
  const trashToastTimerRef = useRef<number | null>(null);
  const [searchEngines, setSearchEngines] = useState<SearchEngine[]>([]);
  const [showEngineSettings, setShowEngineSettings] = useState(false);
  const [recentVisits, setRecentVisits] = useState<{ title: string; url: string; lastVisitTime: number }[]>([]);
  const [focusedBookmarkId, setFocusedBookmarkId] = useState<string | null>(null);
  const [prefocusedBookmarkId, setPrefocusedBookmarkIdRaw] = useState<string | null>(null);
  const setPrefocusedBookmarkId = useCallback((id: string | null) => {
    setPrefocusedBookmarkIdRaw(id);
    if (id != null) setFocusedBookmarkId(null);
  }, []);
  const preSearchCollapsedRef = useRef<string[] | null>(null);
  const { cycle: cycleTheme, label: themeLabel } = useTheme();

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setLastClickedId(null);
  }, []);

  const query$ = useRef(new Subject<string>());
  useEffect(() => {
    const sub = query$.current.pipe(
      debounceTime(300),
      distinctUntilChanged(),
    ).subscribe(q => setSearchQuery(q));
    return () => sub.unsubscribe();
  }, []);

  // Sync expand/collapse with search state
  useEffect(() => {
    if (!treeRef.current) return;
    if (searchQuery) {
      if (preSearchCollapsedRef.current === null) {
        preSearchCollapsedRef.current = Array.from(treeRef.current.getCollapsedIds());
      }
      treeRef.current.expandAll();
    } else if (preSearchCollapsedRef.current !== null) {
      const ids = preSearchCollapsedRef.current;
      preSearchCollapsedRef.current = null;
      for (const id of ids) {
        treeRef.current.collapseNode(id);
      }
    }
  }, [searchQuery]);

  const handleExpandCollapse = useCallback((collapsedIds: ReadonlySet<string>) => {
    if (searchQuery || preSearchCollapsedRef.current !== null) return;
    saveCollapsedIds(Array.from(collapsedIds)).catch(() => {});
  }, [searchQuery]);

  useEffect(() => {
    return () => {
      dragSessionRef.current?.moveSub.unsubscribe();
      dragSessionRef.current?.endSub.unsubscribe();
      if (dropGhostTimerRef.current != null) {
        window.clearTimeout(dropGhostTimerRef.current);
      }
      if (tooltipTimerRef.current != null) {
        window.clearTimeout(tooltipTimerRef.current);
      }
      if (trashToastTimerRef.current != null) {
        window.clearTimeout(trashToastTimerRef.current);
      }
    };
  }, []);

  const reload = useCallback(async () => {
    const data = await loadBookmarkTree();
    setNodes(data);
  }, []);

  const refreshTrash = useCallback(() => {
    loadTrash().then(setTrashItems).catch(() => {});
  }, []);

  useEffect(() => {
    if (trashItems.length === 0) {
      setParentValidMap(new Map());
      setParentTitleMap(new Map());
      return;
    }
    validateTrashParents(trashItems).then(({ validMap, titleMap }) => {
      setParentValidMap(validMap);
      setParentTitleMap(titleMap);
    }).catch(() => {});
  }, [trashItems]);

  const showTrashToast = useCallback((text: string, isWarning = false) => {
    if (trashToastTimerRef.current != null) window.clearTimeout(trashToastTimerRef.current);
    setTrashToast({ text, isWarning });
    trashToastTimerRef.current = window.setTimeout(() => {
      setTrashToast(null);
      trashToastTimerRef.current = null;
    }, 3000);
  }, []);

  const updateNodes = useCallback((updater: (prev: CardTreeNode<BookmarkItem[]>[]) => CardTreeNode<BookmarkItem[]>[]) => {
    setNodes(updater);
  }, []);

  useEffect(() => {
    latestNodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    loadBookmarkTree().then(data => {
      setNodes(data);
      setLoading(false);
      loadFolderDisplaySettings().then(settings => {
        setDisplaySettings(settings);
        const allIds = new Set<string>();
        (function collect(ns: CardTreeNode<BookmarkItem[]>[]) {
          for (const n of ns) { allIds.add(n.id); collect(n.children); }
        })(data);
        cleanupOrphanedSettings(allIds).then(c => setDisplaySettings(c));
      }).catch(() => {});
      // Restore collapse state
      loadCollapsedIds().then(ids => {
        for (const id of ids) {
          treeRef.current?.collapseNode(id);
        }
      }).catch(() => {});
      loadTrash().then(setTrashItems).catch(() => {});
      loadNavRailOrder().then(setNavRailOrder).catch(() => {});
      loadSearchEngines().then(setSearchEngines).catch(() => {});
    }).catch(() => setLoading(false));
  }, []);

  // 首次加载完成后恢复动画（避免入场/折叠动画在初始渲染时执行）
  useEffect(() => {
    if (!loading) {
      const timer = setTimeout(() => setSuppressAnim(false), 50);
      return () => clearTimeout(timer);
    }
  }, [loading]);

  const loadRecentVisits = useCallback(() => {
    if (!chrome.sessions) return;
    const isWebUrl = (u: string) => u.startsWith('http://') || u.startsWith('https://');
    chrome.sessions.getRecentlyClosed({ maxResults: 25 }).then(sessions => {
      const visits: { title: string; url: string; lastVisitTime: number }[] = [];
      for (const s of sessions) {
        if (s.tab?.url && isWebUrl(s.tab.url)) {
          visits.push({ title: s.tab.title ?? s.tab.url, url: s.tab.url, lastVisitTime: s.lastModified * 1000 });
        }
        if (s.window?.tabs) {
          for (const t of s.window.tabs) {
            if (t.url && isWebUrl(t.url) && visits.length < 10) {
              visits.push({ title: t.title ?? t.url, url: t.url, lastVisitTime: s.lastModified * 1000 });
            }
          }
        }
      }
      setRecentVisits(visits.slice(0, 10));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    loadRecentVisits();
    if (!chrome.sessions?.onChanged) return;
    const handler = () => loadRecentVisits();
    chrome.sessions.onChanged.addListener(handler);
    return () => chrome.sessions.onChanged!.removeListener(handler);
  }, [loadRecentVisits]);

  useEffect(() => {
    let timer: number | undefined;
    const scheduleReload = () => {
      clearTimeout(timer);
      timer = window.setTimeout(reload, 120);
    };

    const shouldIgnoreSelfMoveEvent = (bookmarkId: string): boolean => {
      const now = Date.now();
      for (const [id, expireAt] of pendingSelfMoveIdsRef.current) {
        if (expireAt <= now) pendingSelfMoveIdsRef.current.delete(id);
      }

      const expireAt = pendingSelfMoveIdsRef.current.get(bookmarkId);
      if (!expireAt) return false;
      pendingSelfMoveIdsRef.current.delete(bookmarkId);
      return expireAt > now;
    };

    const handleCreated = (id: string) => {
      if (shouldIgnoreSelfMoveEvent(id)) return;
      scheduleReload();
    };
    const handleRemoved = (id: string, _removeInfo: chrome.bookmarks.BookmarkRemoveInfo) => {
      if (shouldIgnoreSelfMoveEvent(id)) return;
      scheduleReload();
    };
    const handleChanged = (id: string) => {
      if (shouldIgnoreSelfMoveEvent(id)) return;
      scheduleReload();
    };
    const handleMoved = (id: string) => {
      if (shouldIgnoreSelfMoveEvent(id)) return;
      scheduleReload();
    };

    chrome.bookmarks.onCreated.addListener(handleCreated);
    chrome.bookmarks.onRemoved.addListener(handleRemoved);
    chrome.bookmarks.onChanged.addListener(handleChanged);
    chrome.bookmarks.onMoved.addListener(handleMoved);
    return () => {
      clearTimeout(timer);
      chrome.bookmarks.onCreated.removeListener(handleCreated);
      chrome.bookmarks.onRemoved.removeListener(handleRemoved);
      chrome.bookmarks.onChanged.removeListener(handleChanged);
      chrome.bookmarks.onMoved.removeListener(handleMoved);
    };
  }, [reload]);

  useEffect(() => {
    const isInput = () => document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !isInput()) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === 'Escape') {
        if (isInput()) { (document.activeElement as HTMLElement)?.blur(); return; }
        if (focusedBookmarkId) { setFocusedBookmarkId(null); setPrefocusedBookmarkIdRaw(null); return; }
        if (prefocusedBookmarkId) { setPrefocusedBookmarkIdRaw(null); return; }
        if (selectedIds.size > 0) { e.preventDefault(); clearSelection(); }
      }

      // ArrowDown/Up from search input → resume from last focused or start from first
      if (isInput() && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        const allEls = document.querySelectorAll<HTMLElement>('[data-bookmark-item-id]');
        if (allEls.length > 0) {
          const resumeId = focusedBookmarkId ?? allEls[0]!.dataset.bookmarkItemId!;
          setFocusedBookmarkId(resumeId);
          setPrefocusedBookmarkIdRaw(null);
          (document.activeElement as HTMLElement)?.blur();
        }
        return;
      }

      if (isInput()) return;

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        setPrefocusedBookmarkId(null);
        const allEls = document.querySelectorAll<HTMLElement>('[data-bookmark-item-id]');
        if (allEls.length === 0) return;
        // Upgrade prefocus to real focus, or start from first
        const activeId = focusedBookmarkId ?? prefocusedBookmarkId;
        if (!activeId) {
          setFocusedBookmarkId(allEls[0]!.dataset.bookmarkItemId!);
          return;
        }
        // Find current element
        let curRect: DOMRect | null = null;
        for (const el of allEls) {
          if (el.dataset.bookmarkItemId === activeId) { curRect = el.getBoundingClientRect(); break; }
        }
        if (!curRect) { setFocusedBookmarkId(allEls[0]!.dataset.bookmarkItemId!); return; }

        const isVertical = e.key === 'ArrowDown' || e.key === 'ArrowUp';
        const isForward = e.key === 'ArrowDown' || e.key === 'ArrowRight';

        // For the current element, get the far edge in the direction of travel,
        // and the near edge for the candidate element
        const getFarEdge = (r: DOMRect) => isVertical ? (isForward ? r.bottom : r.top) : (isForward ? r.right : r.left);
        const getNearEdge = (r: DOMRect) => isVertical ? (isForward ? r.top : r.bottom) : (isForward ? r.left : r.right);
        const curFar = getFarEdge(curRect);

        let bestId: string | null = null;
        let bestScore = Infinity;

        for (const el of allEls) {
          const id = el.dataset.bookmarkItemId!;
          if (id === focusedBookmarkId) continue;
          const r = el.getBoundingClientRect();
          const nearEdge = getNearEdge(r);

          // Must be in the right direction: candidate's near edge must be past current's far edge
          if (isForward ? nearEdge < curFar : nearEdge > curFar) continue;

          // Primary distance: from current's far edge to candidate's near edge
          const primaryDist = Math.abs(nearEdge - curFar);

          // Secondary distance: overlap on the cross-axis
          let secondaryDist: number;
          if (isVertical) {
            // Horizontal overlap: compare centers
            const curCx = curRect.left + curRect.width / 2;
            const cCx = r.left + r.width / 2;
            secondaryDist = Math.abs(curCx - cCx);
          } else {
            const curCy = curRect.top + curRect.height / 2;
            const cCy = r.top + r.height / 2;
            secondaryDist = Math.abs(curCy - cCy);
          }

          // Check adjacent slice: significant cross-axis overlap
          let overlap = 0;
          if (isVertical) {
            overlap = Math.max(0, Math.min(curRect.right, r.right) - Math.max(curRect.left, r.left));
          } else {
            overlap = Math.max(0, Math.min(curRect.bottom, r.bottom) - Math.max(curRect.top, r.top));
          }
          const isAdjacent = overlap > 0;

          // Weighted score: primary distance matters 5x more
          // Adjacent elements get a strong bias (5x weight reduction on secondary)
          const primaryWeight = 5;
          const secondaryWeight = isAdjacent ? 1 : 5;
          const score = primaryDist * primaryWeight + secondaryDist * secondaryWeight;

          if (score < bestScore) { bestScore = score; bestId = id; }
        }

        // Fallback: if nothing found with strict direction, try center-to-center
        if (!bestId) {
          const curCx = curRect.left + curRect.width / 2;
          const curCy = curRect.top + curRect.height / 2;
          for (const el of allEls) {
            const id = el.dataset.bookmarkItemId!;
            if (id === focusedBookmarkId) continue;
            const r = el.getBoundingClientRect();
            const cx = r.left + r.width / 2;
            const cy = r.top + r.height / 2;
            if (isVertical ? (isForward ? cy <= curCy : cy >= curCy) : (isForward ? cx <= curCx : cx >= curCx)) continue;
            const dPrimary = isVertical ? Math.abs(cy - curCy) : Math.abs(cx - curCx);
            const dSecondary = isVertical ? Math.abs(cx - curCx) : Math.abs(cy - curCy);
            const score = dPrimary * 5 + dSecondary;
            if (score < bestScore) { bestScore = score; bestId = id; }
          }
        }

        if (bestId) setFocusedBookmarkId(bestId);
      }

      if (e.key === 'Enter' && focusedBookmarkId) {
        e.preventDefault();
        const fid = bookmarkFolderMapRef.current.get(focusedBookmarkId);
        const bm = fid ? (findNodeInTree(latestNodesRef.current, fid)?.data ?? []).find(b => b.id === focusedBookmarkId) : undefined;
        if (bm) {
          window.open(bm.url, '_blank', 'noopener,noreferrer');
          recordVisit(bm.url).catch(() => {});
        }
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && !focusedBookmarkId && selectedIds.size > 0) {
        e.preventDefault();
        const ids = Array.from(selectedIds);
        (async () => {
          const trashBatch: TrashItem[] = [];
          for (const id of ids) {
            const fid = findBookmarkFolderId(latestNodesRef.current, id);
            const bm = fid ? (findNodeInTree(latestNodesRef.current, fid)?.data ?? []).find(b => b.id === id) : undefined;
            if (bm) {
              trashBatch.push({ id: bm.id, title: bm.title, url: bm.url, parentId: fid!, parentTitle: '', deletedAt: Date.now() });
            }
          }
          for (const id of ids) await deleteBookmark(id);
          if (trashBatch.length > 0) await addToTrash(trashBatch);
          setNodes(prev => {
            let result = prev;
            for (const id of ids) {
              const fid = findBookmarkFolderId(result, id);
              if (fid) result = removeBookmarkFromNodes(result, fid, id);
            }
            return result;
          });
          clearSelection();
          refreshTrash();
        })();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [selectedIds, focusedBookmarkId, clearSelection, refreshTrash]);

  useEffect(() => {
    const id = focusedBookmarkId ?? prefocusedBookmarkId;
    if (!id) return;
    const el = document.querySelector<HTMLElement>(`[data-bookmark-item-id="${id}"]`);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight;
    const margin = 80;
    // Only scroll if outside the comfortable visible zone
    if (rect.top < margin || rect.bottom > vh - margin) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [focusedBookmarkId, prefocusedBookmarkId]);

  const openMenu = useCallback((e: React.MouseEvent, items: MenuItem[]) => {
    e.preventDefault();
    setMenuState({ x: e.clientX, y: e.clientY, items });
  }, []);

  const confirm = useCallback((message: string, action: () => Promise<void>) => {
    setConfirmState({ message, action });
  }, []);

  const clearTooltipTimer = useCallback(() => {
    if (tooltipTimerRef.current != null) {
      window.clearTimeout(tooltipTimerRef.current);
      tooltipTimerRef.current = null;
    }
  }, []);

  const showTooltip = useCallback((e: React.MouseEvent, text: string) => {
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const textW = measureTextWidth(text) + 20;
    const tw = Math.min(textW, 360, window.innerWidth - 16);
    const vw = window.innerWidth;
    const x = Math.max(8, Math.min(rect.left + rect.width / 2 - tw / 2, vw - tw - 8));
    const gap = 8;
    const canTop = rect.top > 40;
    const canBottom = rect.bottom + 40 < window.innerHeight;
    const placement: 'top' | 'bottom' = canTop ? 'top' : canBottom ? 'bottom' : 'top';
    const anchorTop = rect.top - gap;
    const anchorBottom = rect.bottom + gap;
    const arrowX = rect.left + rect.width / 2 - x;
    const nextTooltip = { text, x, anchorTop, anchorBottom, placement, arrowX };
    clearTooltipTimer();
    tooltipTimerRef.current = window.setTimeout(() => {
      setTooltip(nextTooltip);
      tooltipTimerRef.current = null;
    }, TOOLTIP_SHOW_DELAY_MS);
  }, [clearTooltipTimer]);

  const hideTooltip = useCallback(() => {
    clearTooltipTimer();
    setTooltip(null);
  }, [clearTooltipTimer]);

  const getFolderDisplaySize = useCallback((folderId: string, defaultLarge: boolean): boolean => {
    if (folderId in displaySettings) return displaySettings[folderId]!;
    return defaultLarge;
  }, [displaySettings]);

  const toggleFolderDisplaySize = useCallback(async (folderId: string, defaultLarge?: boolean) => {
    const current = getFolderDisplaySize(folderId, defaultLarge ?? true);
    const next = await setFolderDisplaySize(folderId, !current, displaySettings);
    setDisplaySettings(next);
  }, [displaySettings, getFolderDisplaySize]);

  const moveBookmarkToFolder = useCallback(async (bookmarkId: string, sourceFolderId: string, targetFolderId: string) => {
    if (sourceFolderId === targetFolderId) return;
    const sourceNode = findNodeInTree(latestNodesRef.current, sourceFolderId);
    const bm = (sourceNode?.data ?? []).find(b => b.id === bookmarkId);
    if (!bm) return;
    try {
      await chrome.bookmarks.move(bookmarkId, { parentId: targetFolderId });
      setNodes(prev => {
        let result = removeBookmarkFromNodes(prev, sourceFolderId, bookmarkId);
        result = addBookmarkToNodes(result, targetFolderId, bm);
        return result;
      });
    } catch (e) {
      console.error('移动书签失败:', e);
      reload();
    }
    setDialogState(null);
  }, [reload]);

  const updateDragPreview = useCallback((clientX: number, clientY: number) => {
    const previousPointer = pointerPositionRef.current;
    const pointerDelta = previousPointer ? { dx: clientX - previousPointer.x, dy: clientY - previousPointer.y } : null;
    pointerPositionRef.current = { x: clientX, y: clientY };
    const beforeRects = captureBookmarkItemRects();
    setDragPreviewState(prev => {
      const next = findDropTarget(clientX, clientY, prev, pointerDelta);
      if (!next) {
        dragPreviewRef.current = prev;
        return prev;
      }
      if (prev && prev.folderId === next.folderId && prev.dropIndex === next.dropIndex) {
        dragPreviewRef.current = prev;
        return prev;
      }
      dragPreviewRef.current = next;
     pendingDragFlipRef.current = beforeRects;
     return next;
    });
  }, []);

  // FLIP animation while dragging: when dragPreview changes, surrounding
  // bookmark items reflow (placeholder slot moves). Capture-before pattern is
  // set in updateDragPreview; here we synchronously animate the inverted
  // transform pre-paint so items glide instead of snapping.
  useLayoutEffect(() => {
    const beforeRects = pendingDragFlipRef.current;
    if (!beforeRects) return;
    pendingDragFlipRef.current = null;
    if (!isBookmarkDragging) return;
   applyBookmarkFlip(beforeRects, 150);
 }, [dragPreview, isBookmarkDragging]);

  // 放置后飞入 + 重排动画：在 useLayoutEffect 中同步执行，保证 DOM 已提交。
 useLayoutEffect(() => {
   if (!pendingDropAnim) return;
   applyBookmarkFlip(pendingDropAnim.flipRects, 220);
   for (const { id, origin } of pendingDropAnim.flyIn) {
     animateFlyIn(id, origin, 280);
   }
   setPendingDropAnim(null);
 }, [pendingDropAnim]);

 const clearDropGhostLater = useCallback((ghost: ActiveBookmarkDrag) => {
   setDropGhost(ghost);
   if (dropGhostTimerRef.current != null) {
     window.clearTimeout(dropGhostTimerRef.current);
   }
    dropGhostTimerRef.current = window.setTimeout(() => setDropGhost(null), 150);
 }, []);

  const isNoOpBookmarkMove = useCallback((bookmarkId: string, sourceFolderId: string, targetFolderId: string, dropIndex: number): boolean => {
    if (sourceFolderId !== targetFolderId) return false;
    const sourceNode = findNodeInTree(latestNodesRef.current, sourceFolderId);
    if (!sourceNode) return true;
    const sourceData = sourceNode.data ?? [];
    const currentIdx = sourceData.findIndex(b => b.id === bookmarkId);
    if (currentIdx < 0) return true;
    const normalizedDropIndex = clampIndex(dropIndex, sourceData.length);
    return currentIdx === normalizedDropIndex;
  }, []);

  const markBookmarkDragCompleted = useCallback(() => {
    suppressBookmarkClickUntilRef.current = Date.now() + 250;
  }, []);
  const shouldSuppressBookmarkClick = useCallback(() => Date.now() <= suppressBookmarkClickUntilRef.current, []);

  const moveBookmarkBetweenFolders = useCallback(async (
    bookmarkId: string,
    sourceFolderId: string,
    targetFolderId: string,
    dropIndex: number,
    ghostRect?: { left: number; top: number; width: number; height: number } | null
  ) => {
    if (!bookmarkId || !sourceFolderId || !targetFolderId) return;
    const snapshot = latestNodesRef.current;
    const sourceNode = findNodeInTree(snapshot, sourceFolderId);
    const targetNode = findNodeInTree(snapshot, targetFolderId);
    if (!sourceNode || !targetNode) return;
    const bm = (sourceNode.data ?? []).find(b => b.id === bookmarkId);
    if (!bm) return;
    if (isNoOpBookmarkMove(bookmarkId, sourceFolderId, targetFolderId, dropIndex)) return;

    const beforeRects = captureBookmarkItemRects();

    // 乐观更新先于 chrome API：确保 setNodes 与 endSub 中清除拖拽状态
    // 在同一渲染批次提交，避免源位置短暂闪现被拖元素。
    setNodes(prev => {
      let result = findAndUpdateNode(prev, sourceFolderId, n => withBookmarkData(n, (n.data ?? []).filter(b => b.id !== bookmarkId)));
      const targetData = findNodeInTree(result, targetFolderId)?.data ?? [];
      const spliceIdx = Math.min(dropIndex, targetData.length);
      result = findAndUpdateNode(result, targetFolderId, n => {
        const data = [...(n.data ?? [])];
        data.splice(spliceIdx, 0, bm);
        return withBookmarkData(n, data);
      });
      return result;
    });

  // 与 setNodes 同批提交，确保飞入动画在 DOM commit 后的 useLayoutEffect 中播放。
  setPendingDropAnim({
     flyIn: ghostRect ? [{ id: bookmarkId, origin: ghostRect }] : [],
     flipRects: beforeRects,
   });

    pendingSelfMoveIdsRef.current.set(bookmarkId, Date.now() + 1500);
    try {
      const children = await chrome.bookmarks.getChildren(targetFolderId);
      const bookmarkChildren = children.filter(c => c.url);
      const insertIndex = resolveChromeInsertIndex(children, bookmarkChildren, dropIndex);
      const destination: chrome.bookmarks.BookmarkDestinationArg = { parentId: targetFolderId };
      if (insertIndex !== undefined) destination.index = insertIndex;
      await chrome.bookmarks.move(bookmarkId, destination);
    } catch (e) {
      console.error('移动书签失败:', e);
      reload();
    }
  }, [isNoOpBookmarkMove, reload]);

  const toggleBookmarkSelection = useCallback((id: string) => {
    setSelectedIds(prev => toggleSelection(prev, id));
    setLastClickedId(id);
  }, []);

  const rubberBandOriginRef = useRef<{ folderId: string; x: number; y: number } | null>(null);
  const rubberBandMove$ = useRef(new Subject<{ x: number; y: number }>());

  useEffect(() => {
    const sub = rubberBandMove$.current.pipe(
      throttleTime(0, animationFrameScheduler, { leading: true, trailing: true }),
    ).subscribe(({ x, y }) => {
      const origin = rubberBandOriginRef.current;
      if (!origin) return;
      setRubberBand(prev => prev ? { ...prev, currentX: x, currentY: y } : null);
      const left = Math.min(origin.x, x);
      const top = Math.min(origin.y, y);
      const right = Math.max(origin.x, x);
      const bottom = Math.max(origin.y, y);
      if (right - left < 2 && bottom - top < 2) return;
      const items = document.querySelectorAll<HTMLElement>(`[data-bookmark-dropzone="true"][data-folder-id="${origin.folderId}"] [data-bookmark-item-id]`);
      const hitIds: string[] = [];
      items.forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.left < right && r.right > left && r.top < bottom && r.bottom > top) {
          const id = el.dataset.bookmarkItemId;
          if (id) hitIds.push(id);
        }
      });
      setSelectedIds(new Set(hitIds));
    });
    return () => sub.unsubscribe();
  }, []);

  const beginRubberBand = useCallback((e: React.PointerEvent, folderId: string) => {
    if (e.button !== 0 || isBookmarkDragging) return;
    rubberBandOriginRef.current = { folderId, x: e.clientX, y: e.clientY };
    setRubberBand({ folderId, originX: e.clientX, originY: e.clientY, currentX: e.clientX, currentY: e.clientY });
  }, [isBookmarkDragging]);

  const finishRubberBand = useCallback(() => {
    setRubberBand(null);
    rubberBandOriginRef.current = null;
  }, []);

  useEffect(() => {
    const sub = bookmarkDragStart$.current.subscribe(start => {
      dragSessionRef.current?.moveSub.unsubscribe();
      dragSessionRef.current?.endSub.unsubscribe();

      let started = false;
      let currentDrag: ActiveBookmarkDrag | null = null;

      const ensureDragStarted = (clientX: number, clientY: number): ActiveBookmarkDrag => {
        if (currentDrag) return currentDrag;
        currentDrag = { ...start, currentX: clientX, currentY: clientY };
        setIsBookmarkDragging(true);
        setActiveBookmarkDrag(currentDrag);
        dragPreviewRef.current = null;
        return currentDrag;
      };

      let scrollRaf = 0;
      const EDGE_ZONE = 60;
      const SCROLL_SPEED = 12;

      const autoScroll = (clientY: number) => {
        cancelAnimationFrame(scrollRaf);
        const tick = () => {
          const vh = window.innerHeight;
          let delta = 0;
          if (clientY < EDGE_ZONE) delta = -SCROLL_SPEED * (1 - clientY / EDGE_ZONE);
          else if (clientY > vh - EDGE_ZONE) delta = SCROLL_SPEED * (1 - (vh - clientY) / EDGE_ZONE);
          if (delta) {
            window.scrollBy(0, delta);
            scrollRaf = requestAnimationFrame(tick);
          }
        };
        scrollRaf = requestAnimationFrame(tick);
      };

      const moveSub = fromEvent<PointerEvent>(window, 'pointermove').pipe(
        filter(e => e.pointerId === start.pointerId),
        throttleTime(0, animationFrameScheduler, { leading: true, trailing: true }),
      ).subscribe(e => {
        const distance = Math.hypot(e.clientX - start.startX, e.clientY - start.startY);
        if (!started && distance < 5) return;
        started = true;
        const drag = ensureDragStarted(e.clientX, e.clientY);
        drag.currentX = e.clientX;
        drag.currentY = e.clientY;
        setActiveBookmarkDrag({ ...drag });
        updateDragPreview(e.clientX, e.clientY);
        autoScroll(e.clientY);
      });

      const endSub = merge(
        fromEvent<PointerEvent>(window, 'pointerup'),
        fromEvent<PointerEvent>(window, 'pointercancel')
      ).pipe(
        filter(e => e.pointerId === start.pointerId),
        take(1),
      ).subscribe(e => {
        cancelAnimationFrame(scrollRaf);
        const dropPoint = { x: e.clientX, y: e.clientY };
        const finalTarget = findDropTarget(dropPoint.x, dropPoint.y, dragPreviewRef.current, null);
        if (finalTarget) {
          dragPreviewRef.current = finalTarget;
          setDragPreviewState(finalTarget);
        }
       const drag = currentDrag ?? { ...start, currentX: dropPoint.x, currentY: dropPoint.y };

       // 捕获 ghost 位置，用于落下后的 fly-in 动画
       const ghostEl = document.querySelector<HTMLElement>('.bookmark-drag-ghost--floating:not(.is-dropping)');
      const ghostRect = ghostEl ? ghostEl.getBoundingClientRect() : null;

       if (started) {
          clearDropGhostLater(drag);
          markBookmarkDragCompleted();
        }

        if (started && finalTarget) {
          const batchIds = start.batchBookmarkIds;
          if (batchIds && batchIds.length > 1 && finalTarget.folderId !== start.sourceFolderId) {
            const beforeRects = captureBookmarkItemRects();
            const sourceNode = findNodeInTree(latestNodesRef.current, start.sourceFolderId);
            const batchBookmarks = batchIds
              .map(id => (sourceNode?.data ?? []).find(b => b.id === id))
              .filter((b): b is BookmarkItem => !!b);
            // 乐观更新先于 chrome API
            setNodes(prev => {
              let result = prev;
              for (const bm of batchBookmarks) {
                result = removeBookmarkFromNodes(result, start.sourceFolderId, bm.id);
              }
              const dropIdx = clampIndex(finalTarget.dropIndex, (findNodeInTree(result, finalTarget.folderId)?.data ?? []).length);
              result = findAndUpdateNode(result, finalTarget.folderId, n => {
                const data = [...(n.data ?? [])];
                data.splice(dropIdx, 0, ...batchBookmarks);
                return withBookmarkData(n, data);
              });
             return result;
            });
            setPendingDropAnim({
              flyIn: ghostRect ? batchBookmarks.map(bm => ({ id: bm.id, origin: ghostRect })) : [],
              flipRects: beforeRects,
            });
            clearSelection();
            (async () => {
              for (const bm of batchBookmarks) {
                pendingSelfMoveIdsRef.current.set(bm.id, Date.now() + 1500);
                try {
                  await chrome.bookmarks.move(bm.id, { parentId: finalTarget.folderId });
                } catch (err) {
                  console.error('批量拖动移动失败:', err);
                }
              }
            })();
         } else if (!isNoOpBookmarkMove(start.bookmark.id, start.sourceFolderId, finalTarget.folderId, finalTarget.dropIndex)) {
           moveBookmarkBetweenFolders(start.bookmark.id, start.sourceFolderId, finalTarget.folderId, finalTarget.dropIndex, ghostRect);
         } else if (ghostRect) {
         // 无效放置或原地 no-op：从鼠标位置飞回原始位置（回弹动画）。
          setPendingDropAnim({
             flyIn: [{ id: start.bookmark.id, origin: ghostRect }],
             flipRects: new Map(),
           });
          }
        }

        setIsBookmarkDragging(false);
        setActiveBookmarkDrag(null);
        setDragPreviewState(null);
        dragPreviewRef.current = null;
        pointerPositionRef.current = null;
        moveSub.unsubscribe();
        endSub.unsubscribe();
      });

      dragSessionRef.current = { moveSub, endSub };
    });
    return () => sub.unsubscribe();
  }, [clearDropGhostLater, clearSelection, isNoOpBookmarkMove, markBookmarkDragCompleted, moveBookmarkBetweenFolders, updateDragPreview]);

  const beginBookmarkPointerDrag = useCallback((start: BookmarkPointerDragStart) => {
    if (searchQuery || isBookmarkDragging) return;
    hideTooltip();
    dragPreviewRef.current = null;
    pointerPositionRef.current = { x: start.startX, y: start.startY };
    if (selectedIds.has(start.bookmark.id) && selectedIds.size > 1) {
      start = { ...start, batchBookmarkIds: Array.from(selectedIds) };
    }
    bookmarkDragStart$.current.next(start);
  }, [hideTooltip, isBookmarkDragging, searchQuery, selectedIds]);

  const handleAreaContext = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.bookmark-item') || target.closest('.cascade-node-title') || target.closest('button')) return;

    const nodeEl = target.closest('[data-source-id]');
    if (nodeEl) {
      const sourceId = nodeEl.getAttribute('data-source-id')!;
      const folderLabel = nodeEl.querySelector('.cascade-node-title')?.textContent
        || nodeEl.querySelector('.root-bookmark-section__label')?.textContent
        || '未命名文件夹';
      const isRoot = rootSections.some(s => s.id === sourceId);
      const isTopLevelCard = subFolderNodes.some(n => n.id === sourceId);
      const currentLarge = getFolderDisplaySize(sourceId, isRoot || isTopLevelCard);
      e.preventDefault();
      openMenu(e, [
        ...(!isRoot ? [
          { label: '新建子文件夹', onClick: () => setDialogState({ mode: 'add-folder', targetId: '', parentId: sourceId }) },
         { label: '新建书签', onClick: () => setDialogState({ mode: 'add-bookmark', targetId: '', parentId: sourceId }) },
        { separator: true, label: '', onClick: () => {} },
      ] : []),
        ...(!isRoot ? [
          { label: '展开（含子级）', onClick: () => {
            const ref = treeRef.current;
            if (!ref) return;
            ref.expandNode(sourceId);
            (function walk(n: CardTreeNode<BookmarkItem[]> | undefined) {
              if (!n) return;
              for (const c of n.children) { ref.expandNode(c.id); walk(c); }
            })(findNodeInTree(latestNodesRef.current, sourceId) ?? undefined);
          } },
          { label: '折叠（含子级）', onClick: () => {
            const ref = treeRef.current;
            if (!ref) return;
            ref.collapseNode(sourceId);
            (function walk(n: CardTreeNode<BookmarkItem[]> | undefined) {
              if (!n) return;
              for (const c of n.children) { if (c.children.length > 0) ref.collapseNode(c.id); walk(c); }
            })(findNodeInTree(latestNodesRef.current, sourceId) ?? undefined);
          } },
          { separator: true, label: '', onClick: () => {} },
        ] : []),
        { label: currentLarge ? '切换为小图标' : '切换为大图标', onClick: () => toggleFolderDisplaySize(sourceId, isRoot || isTopLevelCard) },
        ...(!isRoot ? [
          { label: '重命名文件夹', onClick: () => setDialogState({ mode: 'rename-folder', targetId: sourceId, parentId: sourceId, initialTitle: folderLabel }) },
          { label: '删除文件夹', danger: true, onClick: () => confirm(`确定删除「${folderLabel}」及其所有内容？`, async () => {
            const folderNode = findNodeInTree(latestNodesRef.current, sourceId);
            if (folderNode) {
              const trashFromFolder: TrashItem[] = [];
              const collectItems = (items: BookmarkItem[], parentId: string, parentTitle: string) => {
                for (const bm of items) trashFromFolder.push({ id: bm.id, title: bm.title, url: bm.url, parentId, parentTitle, deletedAt: Date.now() });
              };
              collectItems(folderNode.data ?? [], sourceId, folderLabel);
              (function collectChildren(ns: CardTreeNode<BookmarkItem[]>[]) {
                for (const n of ns) { collectItems(n.data ?? [], n.id, n.label); collectChildren(n.children); }
              })(folderNode.children);
              if (trashFromFolder.length > 0) await addToTrash(trashFromFolder);
            }
            await deleteFolder(sourceId);
            setNodes(prev => removeFolderFromNodes(prev, sourceId));
            const next = { ...displaySettings };
            delete next[sourceId];
            setDisplaySettings(next);
            chrome.storage?.local?.set({ folderDisplaySizes: next });
            refreshTrash();
          }) },
        ] : []),
      ]);
      return;
    }

    e.preventDefault();
    openMenu(e, [
      { label: '新建文件夹', onClick: () => setDialogState({ mode: 'add-folder', targetId: '', parentId: '1' }) },
      { label: '', separator: true },
      { label: '全部展开', onClick: () => {
        treeRef.current?.expandAll();
        saveCollapsedIds([]).catch(() => {});
      } },
      { label: '全部折叠', onClick: () => {
        treeRef.current?.collapseAll();
        const ids = subFolderNodes.map(n => n.id);
        saveCollapsedIds(ids).catch(() => {});
      } },
    ]);
  };

  const handleSaveDialog = async (title: string, url?: string) => {
    if (!dialogState) return;
    const { mode, targetId, parentId } = dialogState;
    try {
      if (mode === 'add-bookmark') {
        const result = await chrome.bookmarks.create({ parentId, title, url: url! });
        setNodes(prev => addBookmarkToNodes(prev, parentId, { id: result.id, title, url: url! }));
      } else if (mode === 'edit-bookmark') {
        await chrome.bookmarks.update(targetId, { title, url: url! });
        setNodes(prev => updateBookmarkInNodes(prev, parentId, targetId, title, url!));
      } else if (mode === 'add-folder') {
        const result = await chrome.bookmarks.create({ parentId, title });
        setNodes(prev => addFolderToNodes(prev, parentId, { id: result.id, label: title, content: '', data: [], children: [] }));
      } else if (mode === 'rename-folder') {
        await chrome.bookmarks.update(targetId, { title });
        setNodes(prev => renameFolderInNodes(prev, targetId, title));
      }
    } catch (e) {
      console.error('操作失败:', e);
    }
    setDialogState(null);
  };

  const openBookmarks = useCallback((ids: string[]) => {
    for (const id of ids) {
      const fid = bookmarkFolderMapRef.current.get(id);
      const bm = fid ? (findNodeInTree(latestNodesRef.current, fid)?.data ?? []).find(b => b.id === id) : undefined;
      if (bm) {
        window.open(bm.url, '_blank', 'noopener,noreferrer');
        recordVisit(bm.url).catch(() => {});
      }
    }
    clearSelection();
  }, [clearSelection]);

  const handleBatchMove = useCallback(async (bookmarkIds: string[], targetFolderId: string) => {
    const beforeRects = captureBookmarkItemRects();
    for (const id of bookmarkIds) {
      const sourceFolderId = bookmarkFolderMapRef.current.get(id);
      if (!sourceFolderId || sourceFolderId === targetFolderId) continue;
      try {
        await chrome.bookmarks.move(id, { parentId: targetFolderId });
        pendingSelfMoveIdsRef.current.set(id, Date.now() + 1500);
      } catch (e) {
        console.error('批量移动失败:', e);
      }
    }
    setNodes(prev => {
      let result = prev;
      const movedBookmarks: BookmarkItem[] = [];
      for (const id of bookmarkIds) {
        const sourceFolderId = findBookmarkFolderId(result, id);
        if (!sourceFolderId) continue;
        if (sourceFolderId === targetFolderId) continue;
        const sourceNode = findNodeInTree(result, sourceFolderId);
        const bm = (sourceNode?.data ?? []).find(b => b.id === id);
        if (bm) {
          result = removeBookmarkFromNodes(result, sourceFolderId, id);
          movedBookmarks.push(bm);
        }
      }
      if (movedBookmarks.length > 0) {
        result = findAndUpdateNode(result, targetFolderId, n => withBookmarkData(n, [...(n.data ?? []), ...movedBookmarks]));
      }
      return result;
    });
    clearSelection();
    setDialogState(null);
    animateBookmarkItemReflow(beforeRects);
  }, [clearSelection]);

  const restoreFromTrash = useCallback(async (item: TrashItem) => {
    try {
      const { targetId, isFallback, folderTitle } = await resolveRestoreParent(item.parentId);
      await chrome.bookmarks.create({ parentId: targetId, title: item.title, url: item.url });
      await removeFromTrash([item.id]);
      refreshTrash();
      reload();
      if (isFallback) {
        showTrashToast(`原文件夹已删除，已恢复到「${folderTitle}」`, true);
      } else {
        showTrashToast(`已恢复到「${folderTitle}」`);
      }
    } catch (e) {
      console.error('恢复书签失败:', e);
      showTrashToast('恢复失败', true);
    }
  }, [refreshTrash, reload, showTrashToast]);

  const handleClearTrash = useCallback(async () => {
    await clearTrash();
    refreshTrash();
  }, [refreshTrash]);

  const handleConfirm = async () => {
    if (!confirmState) return;
    const action = confirmState.action;
    setConfirmState(null);
    try {
      await action();
    } catch (e) {
      console.error('操作失败:', e);
    }
  };

  const dragDropConfig: DragDropConfig = useMemo(() => ({
    enabled: true,
    showDragHandle: true,
    onDragStart: () => !searchQuery,
    onDrop: (dragId, target) => {
      const chromeParentId = target.targetParentId ?? '1';
      let index: number | undefined;
      if (target.referenceId && target.position !== 'last-child') {
        chrome.bookmarks.getChildren(chromeParentId).then(children => {
          const refIdx = children.findIndex(c => c.id === target.referenceId);
          if (target.position === 'before') index = refIdx;
          else if (target.position === 'after') index = refIdx + 1;
          else if (target.position === 'first-child') index = 0;
          moveBookmark(dragId, chromeParentId, index);
        });
      } else {
        if (target.position === 'first-child') index = 0;
        moveBookmark(dragId, chromeParentId, index);
      }
      return true;
    },
  }), [searchQuery]);

  const rootSections = useMemo(() =>
    nodes.map(n => ({ id: n.id, label: n.label, bookmarks: n.data ?? [] })),
    [nodes]
  );

  const subFolderNodes = useMemo(() =>
    nodes.flatMap(n => n.children),
    [nodes]
  );

  const bookmarkFolderMap = useMemo(() => {
    const map = new Map<string, string>();
    function collect(items: CardTreeNode<BookmarkItem[]>[]) {
      for (const n of items) {
        for (const b of (n.data ?? [])) map.set(b.id, n.id);
        collect(n.children);
      }
    }
    collect(nodes);
    return map;
  }, [nodes]);
  bookmarkFolderMapRef.current = bookmarkFolderMap;

  const folderOptions = useMemo(
    () => buildFolderOptions(rootSections, subFolderNodes),
    [rootSections, subFolderNodes],
  );

  const filteredRootSections = useMemo(() => {
    if (!searchQuery) return rootSections;
    const lower = searchQuery.toLowerCase();
    return rootSections
      .map(s => ({
        ...s,
        bookmarks: s.bookmarks.filter(bm =>
          bm.title.toLowerCase().includes(lower) || bm.url.toLowerCase().includes(lower)
        ),
      }))
      .filter(s => s.bookmarks.length > 0);
  }, [rootSections, searchQuery]);

  const filteredSubNodes = useMemo(
    () => searchQuery ? filterTree(subFolderNodes, searchQuery) : subFolderNodes,
    [subFolderNodes, searchQuery]
  );

  const sortedRootSections = filteredRootSections;

  const sortedSubNodes = filteredSubNodes;

  // ── NavRail items ──
  const navItems = useMemo(() => [
    ...rootSections.map(s => ({ id: s.id, label: s.label, kind: 'root' as const })),
    ...subFolderNodes.map(n => ({ id: n.id, label: n.label, kind: 'subfolder' as const })),
  ], [rootSections, subFolderNodes]);

  const orderedNavItems = useMemo(() => {
    if (!Object.keys(navRailOrder).length) return navItems;
    return [...navItems].sort((a, b) => (navRailOrder[a.id] ?? Infinity) - (navRailOrder[b.id] ?? Infinity));
  }, [navItems, navRailOrder]);

  // Cleanup orphaned navRailOrder entries when items change
  useEffect(() => {
    if (!Object.keys(navRailOrder).length) return;
    const currentIds = new Set(navItems.map(i => i.id));
    const hasOrphan = Object.keys(navRailOrder).some(id => !currentIds.has(id));
    const hasNew = navItems.some(i => !(i.id in navRailOrder));
    if (!hasOrphan && !hasNew) return;
    const entries = Object.entries(navRailOrder).filter(([id]) => currentIds.has(id)).sort((a, b) => a[1] - b[1]);
    const cleaned: NavRailOrder = {};
    let idx = 0;
    for (const [id] of entries) cleaned[id] = idx++;
    for (const item of navItems) {
      if (!(item.id in cleaned)) cleaned[item.id] = idx++;
    }
    setNavRailOrder(cleaned);
    saveNavRailOrder(cleaned).catch(() => {});
  }, [navItems]);

  const handleNavRailClick = useCallback((item: NavItem) => {
    if (item.kind === 'root') {
      const label = document.querySelector<HTMLElement>(`section.root-bookmark-section[data-source-id="${item.id}"] .root-bookmark-section__label`);
      if (label) label.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      // Try direct DOM query first (heading-level scroll)
      const heading = document.querySelector<HTMLElement>(`.cascade-node[data-source-id="${item.id}"] .cascade-node-heading-row`);
      if (heading) {
        heading.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        // Node not rendered yet (virtualized / collapsed) — expand via scrollToNode, then re-target heading
        treeRef.current?.scrollToNode(item.id, { behavior: 'smooth', block: 'center' });
        requestAnimationFrame(() => {
          const h = document.querySelector<HTMLElement>(`.cascade-node[data-source-id="${item.id}"] .cascade-node-heading-row`);
          if (h) h.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      }
    }
  }, []);

  const handleNavRailReorder = useCallback(async (sourceIdx: number, targetIdx: number) => {
    if (sourceIdx === targetIdx) return;
    const movedItem = orderedNavItems[sourceIdx];
    const targetItem = orderedNavItems[targetIdx];
    if (!movedItem || movedItem.kind !== 'subfolder') return;
    if (!targetItem || targetItem.kind !== 'subfolder') return;

    // Locate the root whose children contain the moved subfolder.
    const rootNode = nodes.find(n => n.children.some(c => c.id === movedItem.id));
    if (!rootNode) return;

    // Chrome's actual children list interleaves URLs and subfolders, but CardTreeNode keeps them
    // separate (.data = URLs, .children = subfolders). The drag UI works in subfolder-only space,
    // but chrome.bookmarks.move's `index` is in the FULL children list. Convert by reading live.
    let chromeChildren: chrome.bookmarks.BookmarkTreeNode[];
    try {
      chromeChildren = await chrome.bookmarks.getChildren(rootNode.id);
    } catch (e) {
      console.error('获取子节点失败:', e);
      return;
    }
    const oldChromeIdx = chromeChildren.findIndex(c => c.id === movedItem.id);
    const targetChromeIdx = chromeChildren.findIndex(c => c.id === targetItem.id);
    if (oldChromeIdx < 0 || targetChromeIdx < 0) return;
    if (oldChromeIdx === targetChromeIdx) return;

    // chrome.bookmarks.move same-parent quirk:
    //   index > current  →  source lands at index - 1  (because removing source shifts items up)
    //   index <= current →  source lands at index
    // To make SOURCE land exactly at TARGET's slot, compensate by +1 when dragging down.
    const dragDown = oldChromeIdx < targetChromeIdx;
    const requestedIndex = dragDown ? targetChromeIdx + 1 : targetChromeIdx;
    try {
      await chrome.bookmarks.move(movedItem.id, { parentId: rootNode.id, index: requestedIndex });
    } catch (e) {
      console.error('文件夹排序失败:', e);
    }
    setNavRailOrder({});
    saveNavRailOrder({}).catch(() => {});
  }, [orderedNavItems, nodes]);

  const bookmarkDataMap = useMemo(() => {
    const map = new Map<string, BookmarkItem[]>();
    function collect(items: CardTreeNode<BookmarkItem[]>[]) {
      for (const n of items) {
        map.set(n.id, n.data ?? []);
        collect(n.children);
      }
    }
    collect(sortedSubNodes);
    return map;
  }, [sortedSubNodes]);

  const rangeSelectBookmarks = useCallback((folderId: string, targetId: string) => {
    const bookmarks = bookmarkDataMap.get(folderId) ?? [];
    setSelectedIds(prev => {
      const range = rangeSelect(bookmarks, lastClickedId, targetId);
      return new Set([...prev, ...range]);
    });
    setLastClickedId(targetId);
  }, [lastClickedId, bookmarkDataMap]);

 const isSearching = !!searchQuery;
 const hasNoResults = isSearching && sortedRootSections.length === 0 && sortedSubNodes.length === 0;

  const visibleEngines = useMemo(
    () => searchEngines.filter(e => e.enabled).slice(0, MAX_VISIBLE),
    [searchEngines],
  );

  const handleSearchEnginesChange = useCallback((engines: SearchEngine[]) => {
    setSearchEngines(engines);
    saveSearchEngines(engines).catch(() => {});
  }, []);

  if (loading) {
    return (
      <div className="newtab" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>加载书签中...</span>
      </div>
    );
  }

  return (
    <MenuContext.Provider value={{
      openMenu,
      setDialog: setDialogState,
      confirm,
      reload,
      updateNodes,
      showTooltip,
      hideTooltip,
      isBookmarkDragging,
      activeBookmarkDragId: activeBookmarkDrag?.bookmark.id ?? null,
      activeBookmarkSourceFolderId: activeBookmarkDrag?.sourceFolderId ?? null,
      activeBatchDragIds: activeBookmarkDrag?.batchBookmarkIds ?? [],
      dragPreview,
      beginBookmarkPointerDrag,
      markBookmarkDragCompleted,
      shouldSuppressBookmarkClick,
      moveBookmarkBetweenFolders,
      getFolderDisplaySize,
      toggleFolderDisplaySize,
      folderOptions,
      moveBookmarkToFolder,
      openBookmarks,
      selectedIds,
      toggleBookmarkSelection,
      rangeSelectBookmarks,
      clearSelection,
      beginRubberBand,
      trashItems,
      refreshTrash,
      focusedBookmarkId,
      prefocusedBookmarkId,
      setPrefocusedBookmarkId,
    }}>
      <div className={`newtab${isBookmarkDragging ? ' newtab--bookmark-dragging' : ''}`} onContextMenu={handleAreaContext} onClick={(e) => {
        const target = e.target as HTMLElement;
        if (!target.closest('[data-bookmark-item="true"]') && selectedIds.size > 0) {
          clearSelection();
        }
      }}>
        <div className="newtab-header">
          <svg className="newtab-logo" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="mainCard" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#4285F4"/>
                <stop offset="100%" stopColor="#3B78E7"/>
              </linearGradient>
            </defs>
            <rect width="128" height="128" rx="28" fill="#F8FAFC"/>
            <rect x="10" y="10" width="36" height="108" rx="12" fill="url(#mainCard)" stroke="#fff" strokeWidth="2"/>
            <rect x="88" y="10" width="30" height="34" rx="10" fill="#34A853" stroke="#fff" strokeWidth="2"/>
            <rect x="50" y="50" width="68" height="32" rx="10" fill="#FBBC05" stroke="#fff" strokeWidth="2"/>
            <rect x="50" y="88" width="32" height="30" rx="10" fill="#EA4335" stroke="#fff" strokeWidth="2"/>
            <path d="M66 14L70.9 24L82 25.6L74 33.4L75.9 44.3L66 39.1L56.1 44.3L58 33.4L50 25.6L61.1 24Z" fill="none" stroke="#4285F4" strokeWidth="4.5" strokeLinejoin="round" strokeLinecap="round"/>
            <path d="M102 88L106.9 98L118 99.6L110 107.4L111.9 118.3L102 113.1L92.1 118.3L94 107.4L86 99.6L97.1 98Z" fill="none" stroke="#34A853" strokeWidth="4.5" strokeLinejoin="round" strokeLinecap="round"/>
          </svg>
          <h1 className="newtab-title">CardTree</h1>
         <div className="newtab-header-search">
            <SearchBar ref={searchRef} onQueryChange={q => query$.current.next(q)} engines={visibleEngines} onOpenEngineSettings={() => setShowEngineSettings(true)} />
         </div>
          <div className="header-actions" style={{ position: 'relative' }}>
            <a className="header-btn" href="https://github.com/Dcx199302/cardtree-bookmarks-ext" target="_blank" rel="noopener noreferrer"
              onMouseEnter={(e) => showTooltip(e, 'GitHub 仓库')}
              onMouseLeave={hideTooltip}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
              </svg>
            </a>
            <a className="header-btn" href="https://gridnote.cn/" target="_blank" rel="noopener noreferrer"
              onMouseEnter={(e) => showTooltip(e, '查看作者作品')}
              onMouseLeave={hideTooltip}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="7" r="3" />
                <path d="M3 22v-2c0-3 2.7-5.5 6-5.5" />
                <line x1="19" y1="4" x2="13" y2="15" />
                <path d="M11 17l2-2-3 1z" fill="currentColor" stroke="none" />
              </svg>
            </a>
            <button className={`header-btn${trashItems.length > 0 ? ' header-btn--badge' : ''}`}
              onMouseEnter={(e) => showTooltip(e, '回收站')}
              onMouseLeave={hideTooltip}
              onClick={() => setShowTrash(v => !v)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
            <button className="header-btn"
              onMouseEnter={(e) => showTooltip(e, `主题: ${themeLabel}`)}
              onMouseLeave={hideTooltip}
              onClick={cycleTheme}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                {themeLabel === '深色'
                  ? <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="currentColor" />
                  : themeLabel === '浅色'
                  ? <><circle cx="12" cy="12" r="5" fill="currentColor" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></>
                  : <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>
                }
              </svg>
            </button>
            {showTrash && (
              <TrashPanel items={trashItems} parentValidMap={parentValidMap} parentTitleMap={parentTitleMap} toast={trashToast} onRestore={restoreFromTrash} onDelete={async (ids) => { await removeFromTrash(ids); refreshTrash(); }} onClear={() => confirm('确定清空回收站？', handleClearTrash)} onClose={() => setShowTrash(false)} />
            )}
          </div>
        </div>

        <RootBookmarksCard sections={sortedRootSections} recentVisits={recentVisits} isSearching={!!searchQuery} />

       {sortedSubNodes.length > 0 ? (
          <CardTree
            className={suppressAnim ? 'suppress-init-anim' : undefined}
           ref={treeRef}
           nodes={sortedSubNodes}
            renderNode={(node) => <BookmarkFolderCard node={node} bookmarks={bookmarkDataMap.get(node.sourceId) ?? []} />}
            selectable={false}
            dragDrop={dragDropConfig}
            onExpandCollapse={handleExpandCollapse}
            onNodeUpdate={(nodeId, updates) => {
              if (updates.label) chrome.bookmarks.update(nodeId, { title: updates.label });
            }}
            keyboardNavigation
            virtualization
            style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
          />
        ) : hasNoResults ? (
          <div className="search-empty">未找到匹配的书签</div>
        ) : null}

        <NavRail items={orderedNavItems} hidden={isSearching} onClickItem={handleNavRailClick} onReorder={handleNavRailReorder} />
      </div>

      {menuState && (
        <ContextMenu x={menuState.x} y={menuState.y} items={menuState.items} onClose={() => setMenuState(null)} />
      )}

      {dialogState && (
        <BookmarkDialog state={dialogState} onSave={handleSaveDialog} onMove={moveBookmarkToFolder} onBatchMove={handleBatchMove} onCancel={() => setDialogState(null)} />
      )}

     {confirmState && (
       <ConfirmDialog message={confirmState.message} onConfirm={handleConfirm} onCancel={() => setConfirmState(null)} />
     )}

      {showEngineSettings && (
        <SearchEngineSettingsDialog
          engines={searchEngines}
          onChange={handleSearchEnginesChange}
          onClose={() => setShowEngineSettings(false)}
        />
      )}

      {tooltip && (
        <div className={`global-tooltip${tooltip.placement === 'bottom' ? ' global-tooltip--bottom' : ''}`}
          style={{
            left: tooltip.x,
            ...(tooltip.placement === 'top'
              ? { bottom: window.innerHeight - tooltip.anchorTop }
              : { top: tooltip.anchorBottom }),
            '--arrow-x': `${tooltip.arrowX}px`,
          } as unknown as React.CSSProperties}>
          {tooltip.text}
        </div>
      )}

      {(activeBookmarkDrag || dropGhost) && createPortal(
        <>
          {dropGhost && <FloatingBookmarkGhost drag={dropGhost} dropping />}
          {activeBookmarkDrag && <FloatingBookmarkGhost drag={activeBookmarkDrag} />}
        </>,
        document.body,
      )}

      {rubberBand && <RubberBandOverlay state={rubberBand} onMove={(x, y) => rubberBandMove$.current.next({ x, y })} onFinish={finishRubberBand} />}
    </MenuContext.Provider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <NewTab />
  </StrictMode>,
);
