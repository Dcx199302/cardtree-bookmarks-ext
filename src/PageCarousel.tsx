import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Swiper, SwiperSlide, type SwiperClass } from 'swiper/react';
import { Mousewheel } from 'swiper/modules';
import 'swiper/css';
import { PAGES, type PageId } from './pageConfig';

interface PageCarouselProps {
  order: PageId[];
  activePageId: PageId;
  gestureDisabled: boolean;
  onActivePageChange: (pageId: PageId) => void;
  onOrderChange: (id: PageId, toIndex: number) => void;
  onGestureIntent: () => void;
  renderPage: (pageId: PageId) => ReactNode;
}

interface IndicatorDragState {
  pageId: PageId;
  startIndex: number;
  currentIndex: number;
  offset: number;
}

const NO_SWIPE_SELECTOR = 'a, button, input, textarea, select, [contenteditable="true"], [data-bookmark-item="true"]';
const DOT_DRAG_THRESHOLD = 5;

export function PageCarousel({
  order,
  activePageId,
  gestureDisabled,
  onActivePageChange,
  onOrderChange,
  onGestureIntent,
  renderPage,
}: PageCarouselProps) {
  const [swiper, setSwiper] = useState<SwiperClass | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [indicatorDrag, setIndicatorDrag] = useState<IndicatorDragState | null>(null);
  const indicatorStartRef = useRef<{ pageId: PageId; index: number; pointerId: number; x: number; y: number; started: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  const dotRefs = useRef(new Map<string, HTMLButtonElement>());
  const pagesShellRef = useRef<HTMLDivElement>(null);

  // Chrome 的触控板横向手势会优先触发历史前进/后退。这里在捕获阶段
  // 阻断明确的横向 wheel，让分页优先接管；垂直滚动不受影响。
  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      if (gestureDisabled || event.deltaX === 0) return;
      if (Math.abs(event.deltaX) < 2 || Math.abs(event.deltaX) <= Math.abs(event.deltaY) * 1.2) return;
      // 历史前进/后退手势可能在 document/body 上触发，因此必须挂在 document 捕获阶段。
      event.preventDefault();
    };
    document.addEventListener('wheel', handleWheel, { capture: true, passive: false });
    return () => document.removeEventListener('wheel', handleWheel, { capture: true });
  }, [gestureDisabled]);

  const orderedPages = useMemo(
    () => order.map(id => PAGES.find(page => page.id === id)).filter(page => page != null),
    [order],
  );
  const activeIndex = Math.max(0, orderedPages.findIndex(page => page.id === activePageId));

  // 顺序调整或外部状态变化时，交给 Swiper 自己执行精确 snap。
  useEffect(() => {
    if (!swiper || swiper.destroyed) return;
    if (swiper.activeIndex === activeIndex) return;
    swiper.slideTo(activeIndex, 320, false);
  }, [activeIndex, swiper]);

  const setDotRef = (pageId: PageId) => (element: HTMLButtonElement | null) => {
    if (element) dotRefs.current.set(pageId, element);
    else dotRefs.current.delete(pageId);
  };

  const getNearestDotIndex = (clientX: number, excludedPageId?: PageId) => {
    let nearestIndex = -1;
    let nearestDistance = Number.POSITIVE_INFINITY;
    orderedPages.forEach((page, index) => {
      if (page.id === excludedPageId) return;
      const element = dotRefs.current.get(page.id);
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const distance = Math.abs(clientX - (rect.left + rect.width / 2));
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    return nearestIndex;
  };

  const handleDotPointerDown = (pageId: PageId, index: number) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    indicatorStartRef.current = {
      pageId,
      index,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      started: false,
    };
  };

  const handleDotPointerMove = (pageId: PageId) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    const start = indicatorStartRef.current;
    if (!start || start.pageId !== pageId || start.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (!start.started) {
      if (Math.hypot(deltaX, deltaY) < DOT_DRAG_THRESHOLD) return;
      start.started = true;
      suppressClickRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    }

    const currentIndex = getNearestDotIndex(event.clientX, pageId);
    if (currentIndex < 0) return;
    event.preventDefault();
    setIndicatorDrag({
      pageId,
      startIndex: start.index,
      currentIndex,
      offset: deltaX,
    });
  };

  const finishDotDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const start = indicatorStartRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    indicatorStartRef.current = null;

    if (!start.started) {
      setIndicatorDrag(null);
      return;
    }

    event.preventDefault();
    const currentIndex = getNearestDotIndex(event.clientX, start.pageId);
    if (currentIndex >= 0 && currentIndex !== start.index) {
      onOrderChange(start.pageId, currentIndex);
    }
    setIndicatorDrag(null);
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  };

  return (
    <>
    <div ref={pagesShellRef} className="newtab-pages-shell">
      <Swiper
        className="newtab-pages"
        wrapperClass="newtab-page-track"
        modules={[Mousewheel]}
        initialSlide={activeIndex}
        speed={320}
        threshold={100}
        shortSwipes
        longSwipes
        longSwipesRatio={0.4}
        longSwipesMs={160}
        followFinger
        simulateTouch
        touchAngle={38}
        resistance
        resistanceRatio={0.82}
        touchStartPreventDefault={false}
        preventClicks
        preventClicksPropagation
        noSwipingSelector={NO_SWIPE_SELECTOR}
        mousewheel={{ enabled: true, forceToAxis: true, releaseOnEdges: false, thresholdDelta: 12, thresholdTime: 260 }}
        enabled={!gestureDisabled}
        onSwiper={setSwiper}
        onSlideChange={(instance) => {
          setSelectedIndex(instance.activeIndex);
          const page = orderedPages[instance.activeIndex];
          if (page) onActivePageChange(page.id);
        }}
        onSliderFirstMove={() => onGestureIntent()}
      >
        {orderedPages.map((page, index) => {
          const isActive = index === selectedIndex;
          return (
            <SwiperSlide
              key={page.id}
              tag="section"
              className={`newtab-page newtab-page--${page.id}${isActive ? ' newtab-page--active' : ''}`}
              data-page-id={page.id}
              data-active={isActive}
              aria-label={page.title}
              aria-hidden={!isActive}
              inert={!isActive}
            >
              {renderPage(page.id)}
            </SwiperSlide>
          );
        })}
      </Swiper>
    </div>

    <nav className="page-indicator" aria-label="页面指示器">
        <span id="page-indicator-hint" className="page-indicator__hint">拖拽可以调整顺序</span>
        {orderedPages.map((page, index) => {
          const isDragging = indicatorDrag?.pageId === page.id;
          const isDropTarget = indicatorDrag != null
            && indicatorDrag.currentIndex === index
            && indicatorDrag.pageId !== page.id;
          return (
            <button
              key={page.id}
              ref={setDotRef(page.id)}
              type="button"
              className={[
                'page-indicator__dot',
                index === selectedIndex ? ' page-indicator__dot--active' : '',
                isDragging ? ' page-indicator__dot--dragging' : '',
                isDropTarget ? ' page-indicator__dot--drop-target' : '',
              ].filter(Boolean).join(' ')}
              style={isDragging ? { transform: `translateX(${indicatorDrag?.offset ?? 0}px)` } : undefined}
              onPointerDown={handleDotPointerDown(page.id, index)}
              onPointerMove={handleDotPointerMove(page.id)}
              onPointerUp={finishDotDrag}
              onPointerCancel={finishDotDrag}
              onClick={(event) => {
                if (suppressClickRef.current) {
                  event.preventDefault();
                  event.stopPropagation();
                  return;
                }
                swiper?.slideTo(index, 320, false);
              }}
              aria-label={`切换到 ${page.title}`}
              aria-current={index === selectedIndex ? 'page' : undefined}
              title={page.title}
            />
          );
        })}
      </nav>
    </>
  );
}
