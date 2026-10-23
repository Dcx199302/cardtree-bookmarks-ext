import { Fragment, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

interface BreadcrumbSibling {
  id: string;
  label: string;
}

export interface BreadcrumbFolder extends BreadcrumbSibling {
  siblings: BreadcrumbSibling[];
}

interface BreadcrumbLevelProps {
  id: string | null;
  label: string;
  siblings: BreadcrumbSibling[];
  isCurrent?: boolean;
  onSelect: (folderId: string | null) => void;
  children?: ReactNode;
}

function BreadcrumbLevel({ id, label, siblings, isCurrent, onSelect, children }: BreadcrumbLevelProps) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({ visibility: 'hidden' });
  const levelRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLSpanElement>(null);
  const hasSiblings = siblings.length > 1;

  const closeIfLeaving = (event: React.FocusEvent<HTMLSpanElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  };

  // 菜单宽度会随文件夹名称变化；按视口夹取位置，避免首个层级居中时溢出左侧。
  useLayoutEffect(() => {
    if (!open) return;
    const level = levelRef.current;
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!level || !trigger || !menu) return;

    const updatePosition = () => {
      const levelRect = level.getBoundingClientRect();
      const triggerRect = trigger.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const viewportMargin = 8;
      const maxMenuWidth = Math.min(238, window.innerWidth - viewportMargin * 2);
      let left = triggerRect.left + triggerRect.width / 2 - menuRect.width / 2;
      left = Math.min(Math.max(left, viewportMargin), window.innerWidth - menuRect.width - viewportMargin);
      const availableHeight = window.innerHeight - triggerRect.bottom - viewportMargin;
      setMenuStyle({
        left: `${left - levelRect.left}px`,
        top: `${triggerRect.bottom + 7 - levelRect.top}px`,
        maxWidth: `${maxMenuWidth}px`,
        maxHeight: `${Math.max(120, availableHeight)}px`,
        visibility: 'visible',
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, [open, siblings]);

  return (
    <span
      ref={levelRef}
      className="folder-drill-breadcrumb__level"
      onMouseEnter={() => hasSiblings && setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => hasSiblings && setOpen(true)}
      onBlur={closeIfLeaving}
    >
      <button
        ref={triggerRef}
        type="button"
        className={[
          id === null
            ? 'folder-drill-breadcrumb__root'
            : isCurrent
              ? 'folder-drill-breadcrumb__current'
              : 'folder-drill-breadcrumb__link',
          hasSiblings ? 'folder-drill-breadcrumb__button--has-menu' : '',
        ].filter(Boolean).join(' ')}
        title={id === null ? '返回全部书签' : label}
        aria-current={isCurrent ? 'page' : undefined}
        aria-haspopup={hasSiblings ? 'menu' : undefined}
        aria-expanded={hasSiblings ? open : undefined}
        onClick={() => {
          onSelect(id);
          setOpen(false);
        }}
        aria-label={label}
      >
        {children ?? label}
      </button>
      {open && hasSiblings && (
        <span ref={menuRef} className="folder-drill-breadcrumb__menu" style={menuStyle} role="menu" aria-label={`${label} 的同级文件夹`}>
          {siblings.map(sibling => {
            const isCurrentSibling = sibling.id === id;
            return (
              <button
                key={sibling.id}
                type="button"
                role="menuitemradio"
                aria-checked={isCurrentSibling}
                className={`folder-drill-breadcrumb__menu-item${isCurrentSibling ? ' folder-drill-breadcrumb__menu-item--current' : ''}`}
                title={sibling.label}
                onClick={() => {
                  onSelect(sibling.id);
                  setOpen(false);
                }}
              >
                <span className="folder-drill-breadcrumb__menu-label">{sibling.label}</span>
                <span className="folder-drill-breadcrumb__menu-check" aria-hidden="true">
                  {isCurrentSibling && (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </span>
              </button>
            );
          })}
        </span>
      )}
    </span>
  );
}

export function FolderDrillBreadcrumb({ path, onSelect }: {
  path: BreadcrumbFolder[];
  onSelect: (folderId: string | null) => void;
}) {
  return (
    <nav className="folder-drill-breadcrumb" aria-label="书签文件夹路径">
      <BreadcrumbLevel
        id={null}
        label="返回全部书签"
        siblings={[]}
        isCurrent={path.length === 0}
        onSelect={onSelect}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 9.5V21h14V9.5" />
        </svg>
      </BreadcrumbLevel>
      {path.map((folder, index) => (
        <Fragment key={folder.id}>
          <span className="folder-drill-breadcrumb__separator" aria-hidden="true">/</span>
          <BreadcrumbLevel
            id={folder.id}
            label={folder.label}
            siblings={folder.siblings}
            isCurrent={index === path.length - 1}
            onSelect={onSelect}
          />
        </Fragment>
      ))}
    </nav>
  );
}
