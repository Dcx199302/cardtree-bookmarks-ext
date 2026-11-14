import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { WorkspaceIconButton } from './WorkspaceIconButton';
import { useDialogEscape } from './useDialogEscape';

interface UtilityDialogProps {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  showHeader?: boolean;
}

export function UtilityDialog({
  title,
  description,
  onClose,
  children,
  className,
  showHeader = true,
}: UtilityDialogProps) {
  const dialogRef = useRef<HTMLElement | null>(null);
  useDialogEscape(onClose);

  useEffect(() => {
    const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const focusableSelector = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !dialog) return;

      const focusableElements = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
        .filter(element => element.offsetParent !== null || element === document.activeElement);
      if (focusableElements.length === 0) return;

      const first = focusableElements[0]!;
      const last = focusableElements[focusableElements.length - 1]!;
      const active = document.activeElement;
      if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      }
    };

    document.addEventListener('keydown', handleKeydown, true);
    return () => {
      document.removeEventListener('keydown', handleKeydown, true);
      previousActiveElement?.focus();
    };
  }, []);

  return createPortal(
    <div className="utility-dialog__backdrop">
      <section
        ref={dialogRef}
        tabIndex={-1}
        className={`dialog-card utility-dialog${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {showHeader && (
          <header className="utility-dialog__header">
            <div className="utility-dialog__title-row">
              <h2 className="dialog-title">{title}</h2>
              {description && <p className="utility-dialog__description">{description}</p>}
            </div>
            <WorkspaceIconButton label="关闭弹窗" onClick={onClose}>
              <path d="M6 6l12 12M18 6L6 18" strokeWidth="2" strokeLinecap="round" />
            </WorkspaceIconButton>
          </header>
        )}
        {children}
      </section>
    </div>,
    document.body,
  );
}
