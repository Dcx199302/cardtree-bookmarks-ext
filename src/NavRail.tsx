import { useState, useEffect, useRef, useCallback, Fragment } from 'react';
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
  /** item tops snapshot relative to card scrollable content (so absolute children scroll along) */
  itemTops: number[];
  itemHeights: number[];
  cardLeft: number;
  cardWidth: number;
  ghostLabel: string;
  /** viewport Y of the cursor — ghost is vertically centered on it */
  ghostY: number;
};

// ── Component ──

function NavRail({ items, hidden, onClickItem, onReorder }: NavRailProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const [showCard, setShowCard] = useState(false);
  const hideTimerRef = useRef<number | null>(null);
  const suppressClickRef = useRef(0);
  const dragStart$ = useRef(new Subject<DragStart>());
  const dragSessionRef = useRef<Subscription | null>(null);

  // Refs for stable access inside the RxJS effect (avoids stale closures & resubscription)
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;

  const [dragState, setDragState] = useState<DragState | null>(null);
  const isDragging = dragState != null;
  const cardVisible = showCard || isDragging;

  const handleRailEnter = useCallback(() => {
    if (hideTimerRef.current != null) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
    setShowCard(true);
  }, []);
  const handleRailLeave = useCallback(() => {
    if (isDragging) return;
    hideTimerRef.current = window.setTimeout(() => setShowCard(false), 200);
  }, [isDragging]);
  const handleCardEnter = useCallback(() => {
    if (hideTimerRef.current != null) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
  }, []);
  const handleCardLeave = useCallback(() => {
    if (isDragging) return;
    hideTimerRef.current = window.setTimeout(() => setShowCard(false), 200);
  }, [isDragging]);

  // RxJS drag session
  useEffect(() => {
    const sub = dragStart$.current.subscribe(start => {
      dragSessionRef.current?.unsubscribe();

      let started = false;
      let snapshotTops: number[] = [];
      let snapshotHeights: number[] = [];
      let cardLeft = 0;
      let cardWidth = 0;
      let targetIdx = start.itemIndex;
      let lastClientY = start.startY;

      let scrollRaf = 0;
      const CARD_EDGE = 20;
      const CARD_SPEED = 6;

      const autoScrollCard = (clientY: number) => {
        cancelAnimationFrame(scrollRaf);
        const tick = () => {
          const card = document.querySelector('.nav-rail-card') as HTMLElement | null;
          if (!card) return;
          const r = card.getBoundingClientRect();
          let delta = 0;
          if (clientY < r.top + CARD_EDGE) delta = -CARD_SPEED * Math.max(0, 1 - (clientY - r.top) / CARD_EDGE);
          else if (clientY > r.bottom - CARD_EDGE) delta = CARD_SPEED * Math.max(0, 1 - (r.bottom - clientY) / CARD_EDGE);
          if (delta) {
            card.scrollTop += delta;
            scrollRaf = requestAnimationFrame(tick);
          }
        };
        scrollRaf = requestAnimationFrame(tick);
      };

      /**
       * Snapshot each item's top (in card scrollable coordinates) and height.
       * Items themselves never move during drag, so this snapshot stays valid
       * for the entire drag session — no live DOM reads needed during pointermove.
       */
      const takeSnapshot = () => {
        const card = document.querySelector('.nav-rail-card') as HTMLElement | null;
        if (!card) return false;
        const cardRect = card.getBoundingClientRect();
        cardLeft = cardRect.left;
        cardWidth = cardRect.width;
        const els = card.querySelectorAll<HTMLElement>('[data-nav-idx]');
        snapshotTops = [];
        snapshotHeights = [];
        els.forEach(el => {
          const rect = el.getBoundingClientRect();
          snapshotTops.push(rect.top - cardRect.top + card.scrollTop);
          snapshotHeights.push(rect.height);
        });
        return snapshotTops.length > 0;
      };

      /** Pick the item whose center is nearest to the cursor (Y axis). */
      const computeTargetIdx = (clientY: number): number => {
        const card = document.querySelector('.nav-rail-card') as HTMLElement | null;
        if (!card || snapshotTops.length === 0) return targetIdx;
        const cardRect = card.getBoundingClientRect();
        const relY = clientY - cardRect.top + card.scrollTop;
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
          setShowCard(true);
          if (!takeSnapshot()) return;
          targetIdx = start.itemIndex;
          setDragState({
            sourceIdx: start.itemIndex,
            targetIdx: start.itemIndex,
            itemTops: [...snapshotTops],
            itemHeights: [...snapshotHeights],
            cardLeft,
            cardWidth,
            ghostLabel: start.label,
            ghostY: e.clientY,
          });
          return;
        }
        const newTarget = computeTargetIdx(e.clientY);
        if (newTarget !== targetIdx) targetIdx = newTarget;
        setDragState(prev => prev ? { ...prev, targetIdx, ghostY: e.clientY } : prev);
        autoScrollCard(e.clientY);
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
    if (!items[index] || items[index]!.kind === 'root') return;
    e.preventDefault();
    dragStart$.current.next({
      pointerId: e.pointerId,
      itemIndex: index,
      label: items[index]!.label,
      startY: e.clientY,
    });
  }, [items]);

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
    <>
      <div className="nav-rail" ref={railRef} onMouseEnter={handleRailEnter} onMouseLeave={handleRailLeave}>
        <div className="nav-rail__dot nav-rail__dot--top" />
        {items.map((item) => (
          <Fragment key={item.id}>
            <div className="nav-rail__line" style={{ height: Math.max(6, Math.min(20, 200 / items.length)) }} />
            <div className="nav-rail__dot" />
          </Fragment>
        ))}
      </div>
      {cardVisible && (
        <div
          className={`nav-rail-card${isDragging ? ' nav-rail-card--dragging' : ''}`}
          onMouseEnter={handleCardEnter}
          onMouseLeave={handleCardLeave}
        >
          <div
            className="nav-rail-card__item nav-rail-card__item--top"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            <span className="nav-rail-card__label">↑ 回到顶部</span>
          </div>
          {items.map((item, i) => {
            const isFixed = item.kind === 'root';
            const classes = ['nav-rail-card__item'];
            if (isFixed) classes.push('nav-rail-card__item--fixed');
            return (
              <div
                key={item.id}
                data-nav-idx={i}
                className={classes.join(' ')}
                onClick={() => handleClick(item)}
                onPointerDown={isFixed ? undefined : (e) => handlePointerDown(e, i)}
              >
                <span className="nav-rail-card__dot-indicator" />
                <span className="nav-rail-card__label">{item.label}</span>
              </div>
            );
          })}
          {dragState && placeholderTop != null && placeholderHeight != null && (
            <div
              key={`placeholder-${sourceIdx}`}
              className="nav-rail-card__placeholder"
              style={{ top: placeholderTop, height: placeholderHeight }}
              aria-hidden
            />
          )}
        </div>
      )}
      {dragState && (
        <div
          className="nav-rail-card__item nav-rail-card__item--ghost"
          style={{
            position: 'fixed',
            top: dragState.ghostY,
            left: dragState.cardLeft + 6,
            width: dragState.cardWidth - 12,
            transform: 'translateY(-50%)',
          }}
        >
          <span className="nav-rail-card__dot-indicator" />
          <span className="nav-rail-card__label">{dragState.ghostLabel}</span>
        </div>
      )}
    </>
  );
}

export default NavRail;
