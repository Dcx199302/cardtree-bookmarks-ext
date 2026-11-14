import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  CLIPBOARD_STORAGE_KEY,
  createClipboardEntry,
  deleteClipboardEntry,
  getClipboardRecords,
  loadClipboardEntries,
  MAX_CLIPBOARD_ENTRIES,
  normalizeClipboardEntries,
  saveClipboardEntries,
  updateClipboardEntry,
  type ClipboardEntry,
} from './clipboardStore';
import { WorkspaceIconButton } from './WorkspaceIconButton';

interface ClipboardEditorState {
  id: string | null;
  title: string;
  content: string;
}

interface ClipboardMonthGroup {
  key: string;
  label: string;
  records: ClipboardEntry[];
}

const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

const monthFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: 'long',
});


function HighlightText({ text, query }: { text: string; query: string }) {
  const keyword = query.trim();
  if (!keyword) return <>{text}</>;
  const index = text.toLowerCase().indexOf(keyword.toLowerCase());
  if (index < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + keyword.length)}</mark>
      {text.slice(index + keyword.length)}
    </>
  );
}

function formatClipboardPreview(content: string): string {
  const firstLine = content
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(Boolean);
  return firstLine ?? '空记录';
}

function groupRecordsByMonth(records: ClipboardEntry[]): ClipboardMonthGroup[] {
  const groups: ClipboardMonthGroup[] = [];
  const groupIndex = new Map<string, ClipboardMonthGroup>();

  for (const record of records) {
    const date = new Date(record.updatedAt);
    const key = `${date.getFullYear()}-${String(date.getMonth()).padStart(2, '0')}`;
    let group = groupIndex.get(key);
    if (!group) {
      group = { key, label: monthFormatter.format(date), records: [] };
      groupIndex.set(key, group);
      groups.push(group);
    }
    group.records.push(record);
  }
  return groups;
}

function CopyIcon({ copied }: { copied: boolean }) {
  return copied ? (
    <path d="M5 13l4 4L19 7" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
  ) : (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" strokeWidth="1.8" />
      <path d="M5 15V5a2 2 0 0 1 2-2h8" strokeWidth="1.8" strokeLinecap="round" />
    </>
  );
}

export interface ClipboardManagerProps {
  initialEditorId?: string | null;
  createOnMount?: boolean;
  title?: string;
  onClose?: () => void;
}

export function ClipboardManager({
  initialEditorId = null,
  createOnMount = false,
  title = '剪贴板',
  onClose,
}: ClipboardManagerProps) {
  const [entries, setEntries] = useState<Awaited<ReturnType<typeof loadClipboardEntries>>>([]);
  const [initialized, setInitialized] = useState(false);
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState<ClipboardEditorState | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copyTimerRef = useRef<number | null>(null);
  const editorTextareaRef = useRef<HTMLTextAreaElement>(null);
  const autosaveTimerRef = useRef<number | null>(null);
  const pendingAutosaveRef = useRef<ClipboardEditorState | null>(null);
  const entriesRef = useRef<ClipboardEntry[]>(entries);
  const persistEditorRef = useRef<((source: ClipboardEditorState) => ClipboardEditorState | null) | null>(null);

  // 弹窗关闭会卸载管理器；防抖中的修改必须在卸载前落盘。
  useEffect(() => () => {
    const pending = pendingAutosaveRef.current;
    if (pending) persistEditorRef.current?.(pending);
  }, []);

  useEffect(() => {
    let active = true;
    loadClipboardEntries().then(next => {
      if (!active) return;
      const initialRecord = initialEditorId
        ? next.find(entry => entry.id === initialEditorId) ?? null
        : getClipboardRecords(next)[0] ?? null;
      setEntries(next);
      setEditor(createOnMount
        ? { id: null, title: '', content: '' }
        : initialRecord
          ? { id: initialRecord.id, title: initialRecord.title, content: initialRecord.content }
          : null);
    }).catch(() => {
      if (active) setError('剪贴板记录读取失败');
    }).finally(() => {
      if (active) setInitialized(true);
    });
    return () => {
      active = false;
    };
  }, []);

  // 与右侧列表共享同一份本地存储，写入后保持视图一致。
  useEffect(() => {
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local' || !changes[CLIPBOARD_STORAGE_KEY]) return;
      loadClipboardEntries().then(setEntries).catch(() => undefined);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  useEffect(() => () => {
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    if (autosaveTimerRef.current !== null) window.clearTimeout(autosaveTimerRef.current);
  }, []);

  // 打开记录后立即聚焦编辑区，减少一次点击。
  useEffect(() => {
    if (!editor) return;
    const timer = window.setTimeout(() => editorTextareaRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [editor?.id]);

  const records = useMemo(() => getClipboardRecords(entries, query), [entries, query]);
  const totalRecordCount = entries.length;
  const monthGroups = useMemo(() => groupRecordsByMonth(records), [records]);
  const selectedRecord = useMemo(
    () => editor?.id ? entries.find(entry => entry.id === editor.id) ?? null : null,
    [editor?.id, entries],
  );

  entriesRef.current = entries;

  const commit = (next: ClipboardEntry[]) => {
    const normalized = normalizeClipboardEntries(next);
    entriesRef.current = normalized;
    setEntries(normalized);
    setError(null);
    saveClipboardEntries(normalized).catch(() => setError('剪贴板记录保存失败，当前修改仅保留在本页'));
  };

  const focusEditor = () => {
    window.setTimeout(() => editorTextareaRef.current?.focus(), 20);
  };

  const clearAutosave = () => {
    if (autosaveTimerRef.current !== null) window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = null;
    pendingAutosaveRef.current = null;
  };

  const persistEditor = (source: ClipboardEditorState): ClipboardEditorState | null => {
    if (!source.id && !source.title.trim() && !source.content.trim()) return null;
    if (!source.id) {
      if (entriesRef.current.length >= MAX_CLIPBOARD_ENTRIES) {
        setError(`最多保存 ${MAX_CLIPBOARD_ENTRIES} 条剪贴板记录`);
        return null;
      }
      const record = createClipboardEntry({
        title: source.title.trim() || '未命名记录',
        content: source.content,
      });
      commit([...entriesRef.current, record]);
      return { id: record.id, title: source.title, content: source.content };
    }

    commit(updateClipboardEntry(entriesRef.current, source.id, { title: source.title, content: source.content }));
    return source;
  };
  persistEditorRef.current = persistEditor;

  const runAutosave = () => {
    if (autosaveTimerRef.current !== null) window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = null;
    const pending = pendingAutosaveRef.current;
    pendingAutosaveRef.current = null;
    if (!pending) return;
    const saved = persistEditor(pending);
    if (saved) setEditor(saved);
  };

  const scheduleAutosave = (next: ClipboardEditorState) => {
    if (autosaveTimerRef.current !== null) window.clearTimeout(autosaveTimerRef.current);
    if (!next.id && !next.title.trim() && !next.content.trim()) {
      pendingAutosaveRef.current = null;
      return;
    }
    pendingAutosaveRef.current = next;
    autosaveTimerRef.current = window.setTimeout(runAutosave, 600);
  };

  const updateEditor = (changes: Partial<Omit<ClipboardEditorState, 'id'>>) => {
    if (!editor) return;
    const next = { ...editor, ...changes };
    setEditor(next);
    scheduleAutosave(next);
  };

  const startNewNote = () => {
    runAutosave();
    clearAutosave();
    setEditor({ id: null, title: '', content: '' });
    setConfirmingDelete(false);
    focusEditor();
  };

  /** 列表项点开后直接进入可编辑状态，不再经过只读详情。 */
  const openRecord = (record: ClipboardEntry) => {
    runAutosave();
    clearAutosave();
    setEditor({ id: record.id, title: record.title, content: record.content });
    setConfirmingDelete(false);
    focusEditor();
  };

  const handleDelete = () => {
    if (!editor?.id) {
      const first = getClipboardRecords(entries)[0] ?? null;
      setEditor(first ? { id: first.id, title: first.title, content: first.content } : null);
      setConfirmingDelete(false);
      return;
    }
    clearAutosave();
    const next = deleteClipboardEntry(entries, editor.id);
    commit(next);
    const first = getClipboardRecords(next)[0] ?? null;
    setEditor(first ? { id: first.id, title: first.title, content: first.content } : null);
    setConfirmingDelete(false);
  };

  const handleCopy = async (record: ClipboardEntry) => {
    // 当前记录可能存在尚未落盘的防抖修改；复制时优先使用编辑器中的最新内容。
    const content = record.id === editor?.id ? editor.content : record.content;
    if (!content.trim()) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('unsupported');
      await navigator.clipboard.writeText(content);
      setCopiedId(record.id);
      setError(null);
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopiedId(null), 1600);
    } catch {
      setError('复制失败，请检查浏览器剪贴板权限');
    }
  };

  return (
    <section className="workspace-panel workspace-panel--clipboard" aria-label="剪贴板管理器">
      <header className="workspace-panel__header workspace-panel__header--clipboard">
        <div className="workspace-panel__heading">
          <h2 className="workspace-panel-title">{title}</h2>
          <span className="workspace-panel-description">
            {query ? `匹配 ${records.length}/${totalRecordCount} 条记录` : `${totalRecordCount} 条记录`}
          </span>
        </div>
        <form className="workspace-clip-search" role="search" onSubmit={event => event.preventDefault()}>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="6" strokeWidth="1.8" />
            <path d="M16 16l4 4" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={query}
            placeholder="搜索标题或内容…"
            aria-label="搜索剪贴板记录"
            onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
          />
          {query ? (
            <button type="button" onClick={() => setQuery('')} aria-label="清空搜索">清除</button>
          ) : null}
        </form>
        {onClose && (
          <WorkspaceIconButton label="关闭剪贴板弹窗" onClick={onClose}>
            <path d="M6 6l12 12M18 6L6 18" strokeWidth="2" strokeLinecap="round" />
          </WorkspaceIconButton>
        )}
      </header>

      <div className="workspace-clip-shell">
        <aside className="workspace-clip-sidebar" aria-label="剪贴板记录列表">
          <header className="workspace-clip-sidebar__toolbar">
            <span className="workspace-clip-sidebar__actions">
              <WorkspaceIconButton label="新建记录" onClick={startNewNote}>
                <path d="M12 5v14M5 12h14" strokeWidth="2.1" strokeLinecap="round" />
              </WorkspaceIconButton>
            </span>
          </header>

          {monthGroups.length > 0 ? monthGroups.map(group => (
            <section key={group.key} aria-label={group.label}>
              <header className="workspace-clip-month-header">
                <h3>{group.label}</h3>
              </header>
              <ul>
                {group.records.map(record => (
                  <li
                    key={record.id}
                    className={record.id === editor?.id ? 'workspace-clip-list-item--active' : undefined}
                  >
                    <div className="workspace-clip-list-item">
                      <button
                        type="button"
                        className="workspace-clip-list-item__open"
                        onClick={() => openRecord(record)}
                        aria-current={record.id === editor?.id ? 'true' : undefined}
                      >
                        {record.title && <strong><HighlightText text={record.title} query={query} /></strong>}
                        <span>
                          <HighlightText text={formatClipboardPreview(record.content)} query={query} />
                        </span>
                      </button>
                      <span className={`workspace-clip-list-item__copy${copiedId === record.id ? ' workspace-clip-list-item__copy--copied' : ''}`}>
                        <WorkspaceIconButton
                          label={copiedId === record.id ? '已复制' : `复制 ${record.title || formatClipboardPreview(record.content)}`}
                          onClick={() => void handleCopy(record)}
                          disabled={!record.content.trim()}
                        >
                          <CopyIcon copied={copiedId === record.id} />
                        </WorkspaceIconButton>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )) : (
            <div className="workspace-clip-sidebar__empty">
              {initialized ? (query ? '没有匹配记录' : '暂无记录') : '读取中…'}
            </div>
          )}
        </aside>

        <section className="workspace-clip-detail" aria-label="剪贴板编辑区">
          {editor ? (
            <form className="workspace-clip-editor" onSubmit={event => event.preventDefault()}>
              <header>
                <div>
                  <input
                    className="workspace-clip-title-input"
                    value={editor.title}
                    maxLength={120}
                    placeholder="标题"
                    aria-label="剪贴板记录标题"
                    onChange={(event: ChangeEvent<HTMLInputElement>) => updateEditor({ title: event.target.value })}
                  />
                </div>
                {confirmingDelete ? (
                  <div className="workspace-clip-detail__actions" role="alert">
                    <span>删除这条记录？</span>
                    <button type="button" className="workspace-clip-text-button" onClick={() => setConfirmingDelete(false)}>取消</button>
                    <button type="button" className="workspace-clip-delete-button" onClick={handleDelete}>确认删除</button>
                  </div>
                ) : (
                  <div className="workspace-clip-detail__actions">
                    <WorkspaceIconButton
                      label="删除记录"
                      className="workspace-danger-button"
                      onClick={() => setConfirmingDelete(true)}
                      disabled={!editor.id}
                    >
                      <path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                    </WorkspaceIconButton>
                  </div>
                )}
              </header>
              <div className="workspace-clip-editor__scroll">
                <textarea
                  ref={editorTextareaRef}
                  value={editor.content}
                  maxLength={10000}
                  autoFocus
                  placeholder="输入或粘贴记录内容…"
                  aria-label={editor.id ? '编辑剪贴板记录' : '新建剪贴板记录'}
                  onChange={(event: ChangeEvent<HTMLTextAreaElement>) => updateEditor({ content: event.target.value })}
                />
                {selectedRecord && (
                  <time
                    className="workspace-clip-editor__timestamp"
                    dateTime={new Date(selectedRecord.updatedAt).toISOString()}
                  >
                    {monthFormatter.format(new Date(selectedRecord.updatedAt))} · {dateTimeFormatter.format(new Date(selectedRecord.updatedAt))}
                  </time>
                )}
              </div>
            </form>
          ) : (
            <div className="workspace-clip-detail__empty">
              <button type="button" onClick={startNewNote}>创建一条新记录</button>
            </div>
          )}
        </section>
      </div>

      <p className={`workspace-clip-status${error ? ' workspace-error' : ''}`} role="status" aria-live="polite">
        {copiedId ? '内容已复制到系统剪贴板' : error ? error : ''}
      </p>
    </section>
  );
}
