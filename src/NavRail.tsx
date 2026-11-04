import { useState, useEffect, useRef, useCallback } from 'react';
import { Subject, fromEvent, merge, Subscription } from 'rxjs';
import { filter, take } from 'rxjs/operators';

// ── Types ──

export interface NavItem {
  id: string;
  label: string;
  kind: 'root' | 'subfolder';
}

export interface NavRailProps {
  items: NavItem[];
  hidden: boolean;
  activeId?: string | null;
  onClickItem: (item: NavItem) => void;
  /** Move item at `sourceIdx` to `targetIdx`'s position. No-op when source === target. */
  onReorder: (sourceIdx: number, targetIdx: number) => void;
}

type DragStart = {
  pointerId: number;
  itemIndex: number;
  label: string;
  startY: number;
};

type DragState = {
  sourceIdx: number;
  targetIdx: number;
  /** item tops snapshot relative to scrollable list content (so absolute children scroll along) */
  itemTops: number[];
  itemHeights: number[];
  listLeft: number;
  listWidth: number;
  ghostLabel: string;
  /** viewport Y of the cursor — ghost is vertically centered on it */
  ghostY: number;
};

// ── Component ──

function useExpandedSidebar() {
  const [expanded, setExpanded] = useState(() =>
    window.matchMedia('(min-width: 1200px)').matches,
  );

  useEffect(() => {
    const query = window.matchMedia('(min-width: 1200px)');
    const onChange = () => setExpanded(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return expanded;
}

function NavRail({ items, hidden, activeId, onClickItem, onReorder }: NavRailProps) {
  const suppressClickRef = useRef(0);
  const dragStart$ = useRef(new Subject<DragStart>());
  const dragSessionRef = useRef<Subscription | null>(null);

  // Refs for stable access inside the RxJS effect (avoids stale closures & resubscription)
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;

  const [dragState, setDragState] = useState<DragState | null>(null);
  const canReorder = useExpandedSidebar();

  // RxJS drag session
  useEffect(() => {
    const sub = dragStart$.current.subscribe(start => {
      dragSessionRef.current?.unsubscribe();

      let started = false;
      let snapshotTops: number[] = [];
      let snapshotHeights: number[] = [];
      let listLeft = 0;
      let listWidth = 0;
      let targetIdx = start.itemIndex;
      let lastClientY = start.startY;

      let scrollRaf = 0;
      const LIST_EDGE = 20;
      const LIST_SPEED = 6;

      const autoScrollList = (clientY: number) => {
        cancelAnimationFrame(scrollRaf);
        const tick = () => {
          const list = document.querySelector('.nav-rail__items') as HTMLElement | null;
          if (!list) return;
          const r = list.getBoundingClientRect();
          let delta = 0;
          if (clientY < r.top + LIST_EDGE) delta = -LIST_SPEED * Math.max(0, 1 - (clientY - r.top) / LIST_EDGE);
          else if (clientY > r.bottom - LIST_EDGE) delta = LIST_SPEED * Math.max(0, 1 - (r.bottom - clientY) / LIST_EDGE);
          if (delta) {
            list.scrollTop += delta;
            scrollRaf = requestAnimationFrame(tick);
          }
        };
        scrollRaf = requestAnimationFrame(tick);
      };

      /**
       * Snapshot each item's top in scrollable-list coordinates and its height.
       * Items themselves never move during drag, so this snapshot stays valid
       * for the entire drag session — no live DOM reads needed during pointermove.
       */
      const takeSnapshot = () => {
        const list = document.querySelector('.nav-rail__items') as HTMLElement | null;
        if (!list) return false;
        const listRect = list.getBoundingClientRect();
        listLeft = listRect.left;
        listWidth = listRect.width;
        const els = list.querySelectorAll<HTMLElement>('[data-nav-idx]');
        snapshotTops = [];
        snapshotHeights = [];
        els.forEach(el => {
          const rect = el.getBoundingClientRect();
          snapshotTops.push(rect.top - listRect.top + list.scrollTop);
          snapshotHeights.push(rect.height);
        });
        return snapshotTops.length > 0;
      };

      /** Pick the item whose center is nearest to the cursor (Y axis). */
      const computeTargetIdx = (clientY: number): number => {
        const list = document.querySelector('.nav-rail__items') as HTMLElement | null;
        if (!list || snapshotTops.length === 0) return targetIdx;
        const listRect = list.getBoundingClientRect();
        const relY = clientY - listRect.top + list.scrollTop;
        let nearestIdx = targetIdx;
        let nearestDist = Infinity;
        for (let i = 0; i < snapshotTops.length; i++) {
          const item = itemsRef.current[i];
          if (!item || item.kind === 'root') continue;
          const center = snapshotTops[i]! + snapshotHeights[i]! / 2;
          const dist = Math.abs(relY - center);
          if (dist < nearestDist) {
            nearestDist = dist;
            nearestIdx = i;
          }
        }
        return nearestIdx;
      };

      const moveSub = fromEvent<PointerEvent>(window, 'pointermove').pipe(
        filter(e => e.pointerId === start.pointerId),
      ).subscribe(e => {
        lastClientY = e.clientY;
        if (!started && Math.abs(e.clientY - start.startY) < 5) return;
        if (!started) {
          started = true;
          if (!takeSnapshot()) return;
          targetIdx = start.itemIndex;
          setDragState({
            sourceIdx: start.itemIndex,
            targetIdx: start.itemIndex,
            itemTops: [...snapshotTops],
            itemHeights: [...snapshotHeights],
            listLeft,
            listWidth,
            ghostLabel: start.label,
            ghostY: e.clientY,
          });
          return;
        }
        const newTarget = computeTargetIdx(e.clientY);
        if (newTarget !== targetIdx) targetIdx = newTarget;
        setDragState(prev => prev ? { ...prev, targetIdx, ghostY: e.clientY } : prev);
        autoScrollList(e.clientY);
      });

      const endSub = merge(
        fromEvent<PointerEvent>(window, 'pointerup'),
        fromEvent<PointerEvent>(window, 'pointercancel'),
      ).pipe(
        filter(e => e.pointerId === start.pointerId),
        take(1),
      ).subscribe(() => {
        cancelAnimationFrame(scrollRaf);
        if (started) {
          targetIdx = computeTargetIdx(lastClientY);
          suppressClickRef.current = Date.now() + 300;
          if (targetIdx !== start.itemIndex) {
            onReorderRef.current(start.itemIndex, targetIdx);
          }
        }
        setDragState(null);
        moveSub.unsubscribe();
        endSub.unsubscribe();
      });

      dragSessionRef.current = new Subscription(() => { moveSub.unsubscribe(); endSub.unsubscribe(); });
    });
    return () => sub.unsubscribe();
  }, []); // empty deps — reads from refs

  const handlePointerDown = useCallback((e: React.PointerEvent, index: number) => {
    if (e.button !== 0) return;
    if (!canReorder || !items[index] || items[index]!.kind === 'root') return;
    e.preventDefault();
    dragStart$.current.next({
      pointerId: e.pointerId,
      itemIndex: index,
      label: items[index]!.label,
      startY: e.clientY,
    });
  }, [canReorder, items]);

  const handleClick = useCallback((item: NavItem) => {
    if (Date.now() <= suppressClickRef.current) return;
    onClickItem(item);
  }, [onClickItem]);

  if (hidden || items.length === 0) return null;

  const sourceIdx = dragState?.sourceIdx ?? -1;
  const targetIdx = dragState?.targetIdx ?? -1;
  const placeholderTop = dragState && targetIdx >= 0 ? dragState.itemTops[targetIdx] : undefined;
  const placeholderHeight = dragState && targetIdx >= 0 ? dragState.itemHeights[targetIdx] : undefined;

  return (
    <aside className="nav-rail" aria-label="文件夹导航">
      <div className="nav-rail__panel">
        <button
          type="button"
          className="nav-rail__top"
          title="回到顶部"
          aria-label="回到顶部"
          onClick={() => {
            const pageScroller = document.querySelector<HTMLElement>('.newtab-page[data-page-id="bookmarks"] .newtab-page-body');
            if (pageScroller) pageScroller.scrollTo({ top: 0, behavior: 'smooth' });
            else window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M8 3.5 3 8.25h10L8 3.5Z" fill="currentColor" />
            <path d="M7.25 8h1.5v5h-1.5z" fill="currentColor" />
          </svg>
          <span className="nav-rail__label">回到顶部</span>
        </button>

        <div className="nav-rail__items">
          {items.map((item, i) => {
            const isRoot = item.kind === 'root';
            const isActive = activeId === item.id;
            const classes = [
              'nav-rail__item',
              isRoot ? ' nav-rail__item--root' : '',
              isActive ? ' nav-rail__item--active' : '',
            ].filter(Boolean).join(' ');
            return (
              <button
                key={item.id}
                type="button"
                data-nav-idx={i}
                className={classes}
                title={item.label}
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => handleClick(item)}
              >
                <span className="nav-rail__icon" aria-hidden="true">
                  {item.label.trim().charAt(0).toUpperCase() || '?'}
                </span>
                <span className="nav-rail__label">{item.label}</span>
                {!isRoot && canReorder && (
                  <span
                    className="nav-rail__drag"
                    title="拖拽排序"
                    onPointerDown={(e) => handlePointerDown(e, i)}
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
                      <circle cx="3" cy="2" r="1" /><circle cx="7" cy="2" r="1" />
                      <circle cx="3" cy="5" r="1" /><circle cx="7" cy="5" r="1" />
                      <circle cx="3" cy="8" r="1" /><circle cx="7" cy="8" r="1" />
                    </svg>
                  </span>
                )}
              </button>
            );
          })}

          {dragState && placeholderTop != null && placeholderHeight != null && (
            <div
              key={`placeholder-${sourceIdx}`}
              className="nav-rail__placeholder"
              style={{ top: placeholderTop, height: placeholderHeight }}
              aria-hidden
            />
          )}
        </div>
      </div>

      {dragState && (
        <div
          className="nav-rail__ghost"
          style={{
            position: 'fixed',
            top: dragState.ghostY,
            left: dragState.listLeft,
            width: dragState.listWidth,
            transform: 'translateY(-50%)',
          }}
        >
          <span className="nav-rail__icon" aria-hidden="true">
            {dragState.ghostLabel.trim().charAt(0).toUpperCase() || '?'}
          </span>
          <span className="nav-rail__label">{dragState.ghostLabel}</span>
        </div>
      )}
    </aside>
  );
}

export default NavRail;
