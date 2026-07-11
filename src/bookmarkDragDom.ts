// ── Constants ──

export const FAVICON_COLORS = ['#818cf8', '#f472b6', '#fbbf24', '#34d399', '#60a5fa', '#f87171', '#a78bfa', '#2dd4bf'];
export const TOOLTIP_SHOW_DELAY_MS = 500;

// ── Color / Text Utilities ──

export function hashColor(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return FAVICON_COLORS[Math.abs(h) % FAVICON_COLORS.length]!;
}

const _mCanvas = document.createElement('canvas');
const _mCtx = _mCanvas.getContext('2d')!;

export function measureTextWidth(text: string): number {
  _mCtx.font = '500 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  return _mCtx.measureText(text).width;
}

// ── DOM hit-testing helpers ──

export function clampIndex(value: number, max: number): number {
  return Math.max(0, Math.min(value, max));
}

export function getDropIndexFromPoint(
  dropZone: HTMLElement,
  x: number,
  y: number,
  previousIndex: number | null,
  pointerDelta: { dx: number; dy: number } | null
): number {
  const items = Array.from(dropZone.querySelectorAll<HTMLElement>('[data-bookmark-item="true"]:not(.bookmark-dragging)'));
  if (items.length === 0) return 0;

  const rects = items.map((item, index) => ({
    index,
    rect: item.getBoundingClientRect(),
  }));
  const firstRect = rects[0]!.rect;
  const lastRect = rects[rects.length - 1]!.rect;

  if (y <= firstRect.top - 6) return 0;
  if (y >= lastRect.bottom + 6) return rects.length;

  type Row = {
    start: number;
    end: number;
    top: number;
    bottom: number;
    centerY: number;
  };

  const rows: Row[] = [];
  const indexToRow = new Map<number, number>();
  const rowMergeTolerance = 18;

  for (const entry of rects) {
    const centerY = entry.rect.top + entry.rect.height / 2;
    const rowIndex = rows.findIndex(row => Math.abs(row.centerY - centerY) <= rowMergeTolerance);
    if (rowIndex === -1) {
      rows.push({
        start: entry.index,
        end: entry.index,
        top: entry.rect.top,
        bottom: entry.rect.bottom,
        centerY,
      });
      indexToRow.set(entry.index, rows.length - 1);
      continue;
    }
    const row = rows[rowIndex]!;
    row.start = Math.min(row.start, entry.index);
    row.end = Math.max(row.end, entry.index);
    row.top = Math.min(row.top, entry.rect.top);
    row.bottom = Math.max(row.bottom, entry.rect.bottom);
    row.centerY = (row.centerY + centerY) / 2;
    indexToRow.set(entry.index, rowIndex);
  }

  const stickyY = 12;
  const previousAnchorIndex = previousIndex == null
    ? null
    : clampIndex(previousIndex === rects.length ? rects.length - 1 : previousIndex, rects.length - 1);
  const previousRowIndex = previousAnchorIndex == null ? null : (indexToRow.get(previousAnchorIndex) ?? null);

  let activeRow: Row | null = null;
  if (previousRowIndex != null) {
    const prevRow = rows[previousRowIndex]!;
    if (y >= prevRow.top - stickyY && y <= prevRow.bottom + stickyY) {
      activeRow = prevRow;
    }
  }

  if (!activeRow) {
    activeRow = rows[0]!;
    let bestDistance = Infinity;
    for (const row of rows) {
      const distance = y < row.top ? row.top - y : y > row.bottom ? y - row.bottom : 0;
      if (distance < bestDistance) {
        bestDistance = distance;
        activeRow = row;
      }
    }
  }

  const rowEntries = rects.slice(activeRow.start, activeRow.end + 1);
  if (rowEntries.length === 0) return 0;

  const firstInRow = rowEntries[0]!;
  const lastInRow = rowEntries[rowEntries.length - 1]!;

  if (x <= firstInRow.rect.left) return firstInRow.index;
  if (x >= lastInRow.rect.right) return lastInRow.index + 1;

  for (const entry of rowEntries) {
    const beforeIndex = entry.index;
    const afterIndex = entry.index + 1;
    const axisMid = (entry.rect.left + entry.rect.right) / 2;
    const insideCard = x >= entry.rect.left && x <= entry.rect.right && y >= entry.rect.top && y <= entry.rect.bottom;

    if (insideCard && pointerDelta && Math.abs(pointerDelta.dx) > 0.8 && Math.abs(pointerDelta.dx) >= Math.abs(pointerDelta.dy) * 0.6) {
      return pointerDelta.dx > 0 ? afterIndex : beforeIndex;
    }

    const hysteresis = 3;
    if (x < axisMid - hysteresis) return beforeIndex;
    if (x > axisMid + hysteresis) continue;

    if (previousIndex != null) {
      const prev = clampIndex(previousIndex, items.length);
      if (prev === beforeIndex || prev === afterIndex) return prev;
    }
    return beforeIndex;
  }

  return lastInRow.index + 1;
}

export function findDropTarget(
  x: number,
  y: number,
  previous: { folderId: string; dropIndex: number } | null,
  pointerDelta: { dx: number; dy: number } | null
): { folderId: string; dropIndex: number } | null {
  const elements = document.elementsFromPoint(x, y);

  for (const el of elements) {
    if (!(el instanceof HTMLElement)) continue;
    const zone = el.closest<HTMLElement>('[data-bookmark-dropzone="true"]');
    if (!zone) continue;
    const folderId = zone.dataset.folderId;
    if (!folderId) continue;
    const previousIndex = previous?.folderId === folderId ? previous.dropIndex : null;
    return { folderId, dropIndex: getDropIndexFromPoint(zone, x, y, previousIndex, pointerDelta) };
  }

  if (previous) {
    const retainedZone = document.querySelector<HTMLElement>(`[data-bookmark-dropzone="true"][data-folder-id="${previous.folderId}"]`);
    if (retainedZone) {
      const rect = retainedZone.getBoundingClientRect();
      const expand = 18;
      if (x >= rect.left - expand && x <= rect.right + expand && y >= rect.top - expand && y <= rect.bottom + expand) {
        return {
          folderId: previous.folderId,
          dropIndex: getDropIndexFromPoint(retainedZone, x, y, previous.dropIndex, pointerDelta),
        };
      }
    }
  }

  return null;
}

export function resolveChromeInsertIndex(
  children: chrome.bookmarks.BookmarkTreeNode[],
  bookmarkChildren: chrome.bookmarks.BookmarkTreeNode[],
  dropIndex: number
): number | undefined {
  const insertAt = clampIndex(dropIndex, bookmarkChildren.length);
  if (insertAt < bookmarkChildren.length) {
    const refId = bookmarkChildren[insertAt]!.id;
    const refIndex = children.findIndex(c => c.id === refId);
    return refIndex >= 0 ? refIndex : undefined;
  }

  const last = bookmarkChildren[bookmarkChildren.length - 1];
  if (!last) return 0;
  const lastIndex = children.findIndex(c => c.id === last.id);
  return lastIndex >= 0 ? lastIndex + 1 : undefined;
}

export function captureBookmarkItemRects(): Map<string, DOMRect> {
  const rects = new Map<string, DOMRect>();
  const items = document.querySelectorAll<HTMLElement>('[data-bookmark-item-id]');
  for (const el of items) {
    const id = el.dataset.bookmarkItemId;
    if (!id) continue;
    rects.set(id, el.getBoundingClientRect());
  }
  return rects;
}

export function animateBookmarkItemReflow(beforeRects: Map<string, DOMRect>): void {
  requestAnimationFrame(() => {
    applyBookmarkFlip(beforeRects, 220);
  });
}

// Core FLIP: compare beforeRects to current positions and animate the inverted
// transform back to zero. Intended to be called synchronously after DOM commit
// (e.g. inside useLayoutEffect) so the inverted first frame lands pre-paint.
export function applyBookmarkFlip(beforeRects: Map<string, DOMRect>, duration: number): void {
  const items = document.querySelectorAll<HTMLElement>('[data-bookmark-item-id]');
  for (const el of items) {
    const id = el.dataset.bookmarkItemId;
    if (!id) continue;
    const before = beforeRects.get(id);
    if (!before) continue;
    const after = el.getBoundingClientRect();
    const dx = before.left - after.left;
    const dy = before.top - after.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
    el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px)` },
        { transform: 'translate(0, 0)' },
      ],
      { duration, easing: 'cubic-bezier(0.2, 0, 0, 1)' }
    );
  }
}

// Animate a freshly-landed bookmark from its ghost (pointer release) position
// into its final grid slot. Scale ratio auto-adapts to large/small icon mode.
export function animateFlyIn(
  itemId: string,
  origin: { left: number; top: number; width: number; height: number },
  duration: number
): void {
  const el = document.querySelector<HTMLElement>(`[data-bookmark-item-id="${itemId}"]`);
  if (!el) return;
  const target = el.getBoundingClientRect();
  const dx = origin.left - target.left;
  const dy = origin.top - target.top;
  const sx = target.width > 0 ? origin.width / target.width : 1;
  const sy = target.height > 0 ? origin.height / target.height : 1;
  el.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
      { transform: 'translate(0, 0) scale(1, 1)' },
    ],
    { duration, easing: 'cubic-bezier(0.2, 0, 0, 1)' }
  );
}
