import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CLIPBOARD_STORAGE_KEY,
  getClipboardRecords,
  loadClipboardEntries,
  type ClipboardEntry,
} from './clipboardStore';
import { ClipboardManager } from './ClipboardManager';
import { UtilityDialog } from './UtilityDialog';
import { WorkspaceIconButton } from './WorkspaceIconButton';

type ClipboardDialogState =
  | { mode: 'new' }
  | { mode: 'edit'; id: string };

function CopyIcon({ copied }: { copied: boolean }) {
  return copied
    ? <path d="M5 13l4 4L19 7" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    : (
      <>
        <rect x="9" y="9" width="11" height="11" rx="2" strokeWidth="1.8" />
        <path d="M5 15V5a2 2 0 0 1 2-2h8" strokeWidth="1.8" strokeLinecap="round" />
      </>
    );
}

export function ClipboardRail() {
  const [entries, setEntries] = useState<ClipboardEntry[]>([]);
  const [dialog, setDialog] = useState<ClipboardDialogState | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    loadClipboardEntries().then(next => {
      if (active) setEntries(next);
    }).catch(() => {
      if (active) setError('剪贴板读取失败');
    });
    return () => {
      active = false;
    };
  }, []);

  // 与完整管理弹窗共享同一份本地存储，写入后保持列表一致。
  useEffect(() => {
    let active = true;
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local' || !changes[CLIPBOARD_STORAGE_KEY]) return;
      loadClipboardEntries().then(next => {
        if (active) setEntries(next);
      }).catch(() => undefined);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => {
      active = false;
      chrome.storage.onChanged.removeListener(listener);
    };
  }, []);

  useEffect(() => () => {
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
  }, []);

  const records = useMemo(() => getClipboardRecords(entries), [entries]);

  const copyEntry = async (entry: ClipboardEntry) => {
    try {
      await navigator.clipboard.writeText(entry.content);
      setCopiedId(entry.id);
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopiedId(null), 1600);
    } catch {
      setError('复制失败，请检查浏览器剪贴板权限');
    }
  };

  return (
    <section className="utility-rail__section" aria-label="剪贴板">
      <header className="utility-rail__header">
        <h2>剪贴板</h2>
        <span className="utility-rail__actions">
          <WorkspaceIconButton label="新增剪贴板记录" onClick={() => setDialog({ mode: 'new' })}>
            <path d="M12 5v14M5 12h14" strokeWidth="2" strokeLinecap="round" />
          </WorkspaceIconButton>
        </span>
      </header>

      <div className="utility-rail__list">
        {records.length > 0 ? records.map(entry => (
          <div key={entry.id} className="utility-rail__row-wrap">
            <button
              type="button"
              className="utility-rail__row"
              onClick={() => setDialog({ mode: 'edit', id: entry.id })}
            >
              {entry.title && <strong>{entry.title}</strong>}
              <span>{entry.content.replace(/\s+/g, ' ').trim() || '空记录'}</span>
            </button>
            <WorkspaceIconButton
              className="utility-rail__row-action"
              label={copiedId === entry.id ? '已复制' : `复制 ${entry.title || entry.content.replace(/\s+/g, ' ').trim() || '空记录'}`}
              onClick={() => void copyEntry(entry)}
            >
              <CopyIcon copied={copiedId === entry.id} />
            </WorkspaceIconButton>
          </div>
        )) : (
          <div className="utility-rail__empty">{error ?? '点击右上角管理记录'}</div>
        )}
      </div>

      {dialog && (
        <UtilityDialog
          title="剪贴板"
          onClose={() => setDialog(null)}
          className="utility-dialog--clipboard-manager"
          showHeader={false}
        >
          <ClipboardManager
            key={dialog.mode === 'edit' ? dialog.id : 'new'}
            initialEditorId={dialog.mode === 'edit' ? dialog.id : null}
            createOnMount={dialog.mode === 'new'}
            title="剪贴板"
            onClose={() => setDialog(null)}
          />
        </UtilityDialog>
      )}
    </section>
  );
}
