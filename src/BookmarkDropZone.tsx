import { useContext, useMemo } from 'react';
import type { ViewModelNode } from '@xuchengdong/cardtree-react';
import type { BookmarkItem } from './bookmarks';
import { MenuContext } from './menuContextTypes';
import { FaviconImg } from './FaviconImg';
import { buildBookmarkGridItems, openBookmarkContextMenu } from './bookmarkDragUI';

// ── Draggable Bookmark Item ──

function DraggableBookmarkItem({
  bm, folderId, large, onContext, onShowTooltip, onHideTooltip, isSelected,
}: {
  bm: BookmarkItem;
  folderId: string;
  large?: boolean;
  onContext: (e: React.MouseEvent) => void;
  onShowTooltip: (e: React.MouseEvent) => void;
  onHideTooltip: () => void;
  isSelected?: boolean;
}) {
  const menuCtx = useContext(MenuContext);

  return (
    <a
      className={`bookmark-item${isSelected ? ' bookmark-selected' : ''}${menuCtx?.focusedBookmarkId === bm.id ? ' bookmark-focused' : ''}${menuCtx?.prefocusedBookmarkId === bm.id && menuCtx?.focusedBookmarkId !== bm.id ? ' bookmark-prefocused' : ''}`}
      data-bookmark-item="true"
      data-bookmark-item-id={bm.id}
      href={bm.url}
      target="_blank"
      rel="noopener noreferrer"
      tabIndex={-1}
      draggable={false}
      onPointerDown={(e: React.PointerEvent) => {
        e.stopPropagation();
        e.preventDefault();
        if (e.button !== 0 || !menuCtx || menuCtx.isBookmarkDragging) return;
        if (e.ctrlKey || e.metaKey || e.shiftKey) return;
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        menuCtx.beginBookmarkPointerDrag({
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          offsetX: e.clientX - rect.left,
          offsetY: e.clientY - rect.top,
          sourceFolderId: folderId,
          bookmark: bm,
          large: !!large,
        });
      }}
      onDragStart={(e) => e.preventDefault()}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        if (!menuCtx || menuCtx.shouldSuppressBookmarkClick() || menuCtx.isBookmarkDragging) return;
        if (e.shiftKey) {
          menuCtx.rangeSelectBookmarks(folderId, bm.id);
        } else if (e.ctrlKey || e.metaKey) {
          window.open(bm.url, '_blank', 'noopener,noreferrer');
        } else if (isSelected) {
          // click on already-selected item: keep selection
        } else {
          menuCtx.clearSelection();
          window.location.href = bm.url;
        }
      }}
      onContextMenu={(e) => {
        // On macOS, Ctrl+click triggers contextmenu after the click handler.
        // The click handler already opened the new tab — suppress the menu.
        if (e.ctrlKey) {
          e.preventDefault();
          return;
        }
        onContext(e);
      }}
      onMouseEnter={onShowTooltip}
      onMouseLeave={onHideTooltip}
    >
      <FaviconImg url={bm.url} large={large} />
      <span className="bookmark-title">{bm.title}</span>
    </a>
  );
}

// ── BookmarkDropZone ──

function BookmarkDropZone({ folderId, bookmarks, isLarge, emptyLabel }: {
  folderId: string;
  bookmarks: BookmarkItem[];
  isLarge: boolean;
  emptyLabel?: string;
}) {
  const menuCtx = useContext(MenuContext);
  const activeDragId = menuCtx?.activeBookmarkDragId ?? null;
  const batchDragIds = menuCtx?.activeBatchDragIds ?? [];
  const isSourceFolder = (!!activeDragId || batchDragIds.length > 0) && menuCtx?.activeBookmarkSourceFolderId === folderId;
  const renderedBookmarks = useMemo(
    () => isSourceFolder ? bookmarks.filter(bm => bm.id !== activeDragId && !batchDragIds.includes(bm.id)) : bookmarks,
    [bookmarks, isSourceFolder, activeDragId, batchDragIds]
  );
  const currentDropIndex = menuCtx?.dragPreview?.folderId === folderId
    ? menuCtx.dragPreview!.dropIndex
    : (!menuCtx?.dragPreview && isSourceFolder ? bookmarks.findIndex(b => b.id === activeDragId) : null);
  const isDropTarget = currentDropIndex !== null;
  const gridItems = useMemo(
    () => buildBookmarkGridItems(
      renderedBookmarks,
      currentDropIndex,
      isLarge,
      bm => (
        <DraggableBookmarkItem
          key={bm.id}
          bm={bm}
          folderId={folderId}
          large={isLarge}
          onContext={e => openBookmarkContextMenu(e, menuCtx!, bm, folderId)}
          onShowTooltip={e => menuCtx?.showTooltip(e, bm.title)}
          onHideTooltip={() => menuCtx?.hideTooltip()}
          isSelected={menuCtx?.selectedIds.has(bm.id) ?? false}
        />
      )
    ),
    [renderedBookmarks, currentDropIndex, isLarge, folderId, menuCtx]
  );

  const handleGridPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-bookmark-item="true"]')) return;
    if (e.button !== 0) return;
    if (!e.ctrlKey && !e.metaKey) menuCtx?.clearSelection();
    // Click on card blank area: clear old focus, pre-focus first bookmark in this card
    const firstItem = (e.currentTarget as HTMLElement).querySelector<HTMLElement>('[data-bookmark-item-id]');
    if (firstItem?.dataset.bookmarkItemId) {
      menuCtx?.setPrefocusedBookmarkId(firstItem.dataset.bookmarkItemId);
    }
    menuCtx?.beginRubberBand(e, folderId);
  };

  if (bookmarks.length === 0) {
    return (
      <div
        className={`bookmark-empty${isDropTarget ? ' bookmark-empty--drop-target' : ''}`}
        data-bookmark-dropzone="true"
        data-folder-id={folderId}
        onPointerDown={handleGridPointerDown}
      >
        {emptyLabel}
      </div>
    );
  }

  return (
    <div
      className={`bookmark-grid${isLarge ? ' bookmark-grid--large' : ''}${isDropTarget ? ' bookmark-grid--drop-target' : ''}`}
      data-bookmark-dropzone="true"
      data-folder-id={folderId}
      onPointerDown={handleGridPointerDown}
    >
      {gridItems}
    </div>
  );
}

// ── BookmarkFolderCard ──

export function BookmarkFolderCard({ node, bookmarks }: { node: ViewModelNode; bookmarks: BookmarkItem[] }) {
  const menuCtx = useContext(MenuContext);
  const isLarge = menuCtx?.getFolderDisplaySize(node.sourceId, node.depth === 0) ?? (node.depth === 0);
  const hasChildren = node.children.length > 0;

  return (
    <BookmarkDropZone
      folderId={node.sourceId}
      bookmarks={bookmarks}
      isLarge={isLarge}
      emptyLabel={bookmarks.length === 0 && !hasChildren ? '拖拽书签到此处' : undefined}
    />
  );
}

// ── Root Bookmarks Card ──

export interface RootSection {
  id: string;
  label: string;
  bookmarks: BookmarkItem[];
}

export function RootBookmarksCard({ sections, recentVisits, isSearching }: { sections: RootSection[]; recentVisits: { title: string; url: string; lastVisitTime: number }[]; isSearching: boolean }) {
  const menuCtx = useContext(MenuContext);
  const showRecent = !isSearching && recentVisits.length > 0;
  if (sections.length === 0 && !showRecent) return null;
  return (
    <div className="root-bookmarks-card">
      {showRecent && (
        <div className="root-recent-section">
          <div className="root-recent-section__label">
            最近关闭
            <button
              className="root-recent-section__history-btn"
              title="打开历史记录"
              onClick={() => {
                try { chrome.tabs.create({ url: 'chrome://history/' }); }
                catch { window.open('chrome://history/', '_blank'); }
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </button>
          </div>
          <div className="root-recent-section__grid">
            {recentVisits.map((item, i) => (
              <a
                key={`${item.url}-${i}`}
                className="root-recent-section__item"
                href={item.url}
                rel="noopener noreferrer"
                tabIndex={-1}
                onMouseEnter={(e) => menuCtx?.showTooltip(e, item.title)}
                onMouseLeave={() => menuCtx?.hideTooltip()}
                onClick={(e) => {
                  if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    window.open(item.url, '_blank', 'noopener,noreferrer');
                  } else if (!e.shiftKey) {
                    e.preventDefault();
                    window.location.href = item.url;
                  }
                }}
                onContextMenu={(e) => {
                  if (e.ctrlKey) {
                    e.preventDefault();
                    window.open(item.url, '_blank', 'noopener,noreferrer');
                  }
                }}
              >
                <FaviconImg url={item.url} />
                <span className="root-recent-section__item-title">{item.title}</span>
              </a>
            ))}
          </div>
        </div>
      )}
      {sections.length > 0 && (
      <div className="root-bookmarks-card__columns">
        {sections.map(section => (
          <RootBookmarkSection key={section.id} section={section} />
        ))}
      </div>
      )}
    </div>
  );
}

function RootBookmarkSection({ section }: { section: RootSection }) {
  const menuCtx = useContext(MenuContext);
  const isLarge = menuCtx?.getFolderDisplaySize(section.id, true) ?? true;

  return (
    <section className="root-bookmark-section" data-source-id={section.id}>
      <div className="root-bookmark-section__label">{section.label}</div>
      <BookmarkDropZone
        folderId={section.id}
        bookmarks={section.bookmarks}
        isLarge={isLarge}
        emptyLabel="拖拽书签到此处"
      />
    </section>
  );
}
