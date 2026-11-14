import type { ReactNode } from 'react';

interface WorkspaceIconButtonProps {
  label: string;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
}

export function WorkspaceIconButton({ label, onClick, children, className = '', disabled, type = 'button' }: WorkspaceIconButtonProps) {
  return (
    <button
      type={type}
      className={`workspace-icon-button${className ? ` ${className}` : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}
