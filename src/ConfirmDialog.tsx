export function ConfirmDialog({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div className="dialog-card" onClick={e => e.stopPropagation()}>
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
