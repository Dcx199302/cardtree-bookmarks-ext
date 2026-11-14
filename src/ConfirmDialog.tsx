import { useDialogEscape } from './useDialogEscape';

export function ConfirmDialog({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  useDialogEscape(onCancel);
  return (
    <div className="dialog-backdrop">
      <div className="dialog-card" role="dialog" aria-modal="true" aria-label="确认操作">
        <h3 className="dialog-title">确认操作</h3>
        <p className="dialog-message">{message}</p>
        <div className="dialog-actions">
          <button className="dialog-btn dialog-btn--cancel" onClick={onCancel}>取消</button>
          <button className="dialog-btn dialog-btn--primary" style={{ background: 'var(--danger)' }} onClick={onConfirm}>删除</button>
        </div>
      </div>
    </div>
  );
}
