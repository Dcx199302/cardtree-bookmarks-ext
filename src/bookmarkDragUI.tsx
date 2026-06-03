import { type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { MenuItem } from './ContextMenu';
import type { BookmarkItem } from './bookmarks';
import type { MenuContextValue, ActiveBookmarkDrag, RubberBandState } from './menuContextTypes';
import { FaviconImg } from './FaviconImg';
import { findBookmarkFolderId, findNodeInTree, removeBookmarkFromNodes } from './bookmarkTreeHelpers';
import { deleteBookmark } from './bookmarkActions';
import { addToTrash, type TrashItem } from './trashStore';
import { clampIndex } from './bookmarkDragDom';

// ── Bookmark Grid Builder ──

function BookmarkPlaceholder({ large }: { large?: boolean }) {
  return <div className={`bookmark-placeholder${large ? ' bookmark-placeholder--large' : ''}`} aria-hidden="true" />;
}

export function buildBookmarkGridItems(
  bookmarks: BookmarkItem[],
  placeholderIndex: number | null,
  large: boolean,
  renderItem: (bookmark: BookmarkItem) => ReactNode
): ReactNode[] {
  const items: ReactNode[] = [];
  const insertAt = placeholderIndex == null ? -1 : clampIndex(placeholderIndex, bookmarks.length);

  for (let i = 0; i <= bookmarks.length; i++) {
    if (insertAt === i) {
      items.push(<BookmarkPlaceholder key={`bookmark-placeholder-${i}`} large={large} />);
    }
    if (i < bookmarks.length) {
      items.push(renderItem(bookmarks[i]!));
    }
  }

  return items;
}

// ── Drag Visual Components ──

function BookmarkGhost({ bm, large }: { bm: BookmarkItem; large?: boolean }) {
  return (
    <>
      <FaviconImg url={bm.url} large={large} />
      <span>{bm.title}</span>
    </>
  );
}

export function FloatingBookmarkGhost({
  drag,
  dropping,
}: {
  drag: ActiveBookmarkDrag;
  dropping?: boolean;
}) {
  const count = drag.batchBookmarkIds?.length ?? 0;
  return (
    <div
      className={`bookmark-drag-ghost bookmark-drag-ghost--floating${drag.large ? ' bookmark-drag-ghost--large' : ''}${dropping ? ' is-dropping' : ''}`}
      style={{ left: drag.currentX - drag.offsetX, top: drag.currentY - drag.offsetY }}
    >
      <BookmarkGhost bm={drag.bookmark} large={drag.large} />
      {count > 1 && <span className="bookmark-drag-ghost-badge">{count}</span>}
    </div>
  );
}

export function RubberBandOverlay({ state, onMove, onFinish }: { state: RubberBandState; onMove: (x: number, y: number) => void; onFinish: () => void }) {
  const left = Math.min(state.originX, state.currentX);
  const top = Math.min(state.originY, state.currentY);
  const width = Math.abs(state.currentX - state.originX);
  const height = Math.abs(state.currentY - state.originY);
  return createPortal(
    <div
      className="rubber-band-overlay-wrapper"
      onPointerMove={(e) => { e.preventDefault(); onMove(e.clientX, e.clientY); }}
      onPointerUp={(e) => { e.preventDefault(); onMove(e.clientX, e.clientY); onFinish(); }}
    >
      <div
        className="rubber-band-overlay"
        style={{ left, top, width, height }}
      />
    </div>,
    document.body,
  );
}

// ── Batch Menu Builder ──

export function buildBatchMenuItems(ids: string[], menuCtx: MenuContextValue): MenuItem[] {
  return [
    { label: '批量打开', onClick: () => menuCtx.openBookmarks(ids) },
    { label: '批量移动到…', onClick: () => menuCtx.setDialog({ mode: 'batch-move' as const, targetId: '', parentId: '', bookmarkIds: ids, folders: menuCtx.folderOptions }) },
    { separator: true, label: '', onClick: () => {} },
    { label: '批量删除', danger: true, onClick: () => menuCtx.confirm(
      `确定删除 ${ids.length} 个书签？`,
      async () => {
        const trashBatch: TrashItem[] = [];
        menuCtx.updateNodes(prev => {
          for (const id of ids) {
            const fid = findBookmarkFolderId(prev, id);
            if (!fid) continue;
            const node = findNodeInTree(prev, fid);
            const bm = (node?.data ?? []).find(b => b.id === id);
            if (bm) {
              const parentLabel = menuCtx.folderOptions.find(f => f.id === fid)?.label ?? '';
              trashBatch.push({ id: bm.id, title: bm.title, url: bm.url, parentId: fid, parentTitle: parentLabel, deletedAt: Date.now() });
            }
          }
          let result = prev;
          for (const id of ids) {
            const fid = findBookmarkFolderId(result, id);
            if (fid) result = removeBookmarkFromNodes(result, fid, id);
          }
          return result;
        });
        for (const id of ids) { await deleteBookmark(id); }
        if (trashBatch.length > 0) {
          await addToTrash(trashBatch);
          menuCtx.refreshTrash();
        }
        menuCtx.clearSelection();
      },
    )},
  ];
}

export function openBookmarkContextMenu(e: React.MouseEvent, menuCtx: MenuContextValue, bm: BookmarkItem, folderId: string) {
  e.preventDefault();
  e.stopPropagation();
  const selected = menuCtx.selectedIds;
  const isSelected = selected.has(bm.id);
  if (isSelected && selected.size > 1) {
    menuCtx.openMenu(e, buildBatchMenuItems(Array.from(selected), menuCtx));
    return;
  }
  if (!isSelected) menuCtx.clearSelection();
  menuCtx.openMenu(e, [
    { label: '打开链接', onClick: () => window.open(bm.url, '_blank') },
    { label: '复制链接', onClick: () => navigator.clipboard.writeText(bm.url) },
    { separator: true, label: '', onClick: () => {} },
    { label: '移动到…', onClick: () => menuCtx.setDialog({ mode: 'move-bookmark', targetId: bm.id, parentId: folderId, bookmarkId: bm.id, bookmarkTitle: bm.title, folders: menuCtx.folderOptions }) },
    { label: '编辑', onClick: () => menuCtx.setDialog({ mode: 'edit-bookmark', targetId: bm.id, parentId: folderId, initialTitle: bm.title, initialUrl: bm.url }) },
    { label: '删除', danger: true, onClick: () => menuCtx.confirm(`确定删除「${bm.title}」？`, async () => {
      const parentLabel = menuCtx.folderOptions.find(f => f.id === folderId)?.label ?? '';
      await addToTrash([{ id: bm.id, title: bm.title, url: bm.url, parentId: folderId, parentTitle: parentLabel, deletedAt: Date.now() }]);
      await deleteBookmark(bm.id);
      menuCtx.updateNodes(prev => removeBookmarkFromNodes(prev, folderId, bm.id));
      menuCtx.refreshTrash();
    }) },
  ]);
}
