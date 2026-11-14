export interface ClipboardEntry {
  id: string;
  title: string;
  content: string;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export const CLIPBOARD_STORAGE_KEY = 'workspaceClipboard';
const STORAGE_KEY = CLIPBOARD_STORAGE_KEY;
export const MAX_CLIPBOARD_ENTRIES = 200;
export const MAX_CLIPBOARD_TITLE_LENGTH = 120;
export const MAX_CLIPBOARD_CONTENT_LENGTH = 10000;
const MAX_TITLE_LENGTH = MAX_CLIPBOARD_TITLE_LENGTH;
const MAX_CONTENT_LENGTH = MAX_CLIPBOARD_CONTENT_LENGTH;
const MAX_JS_TIMESTAMP = 8_640_000_000_000_000;

export function normalizeClipboardTitle(raw: string): string {
  const title = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE_LENGTH);
  // 旧版本会把空标题写成“未命名记录”；这里一并还原为空标题，避免旧数据显示出伪标题。
  return title === '未命名记录' ? '' : title;
}

export function normalizeClipboardContent(raw: string): string {
  return raw.replace(/\r\n?/g, '\n').slice(0, MAX_CONTENT_LENGTH);
}

function normalizeTimestamp(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return Date.now();
  // Date 格式化超出 ECMAScript 范围会抛错；夹紧避免污染数据拖垮页面。
  return Math.min(Math.max(Math.trunc(raw), 0), MAX_JS_TIMESTAMP);
}

/**
 * 兼容旧版 group/record 结构：只保留记录本身，丢弃分组元数据。
 * 这样本地数据可以无损迁移，界面也不再暴露分组概念。
 */
export function normalizeClipboardEntries(raw: unknown): ClipboardEntry[] {
  const source = Array.isArray(raw) ? raw.slice(0, MAX_CLIPBOARD_ENTRIES) : [];
  const entries: ClipboardEntry[] = [];
  const ids = new Set<string>();

  for (const value of source) {
    if (typeof value !== 'object' || value === null) continue;
    const item = value as Partial<ClipboardEntry> & { kind?: unknown };
    if (item.kind !== undefined && item.kind !== 'record') continue;

    const id = typeof item.id === 'string' ? item.id.slice(0, 128) : '';
    if (!id || ids.has(id)) continue;

    ids.add(id);
    entries.push({
      id,
      title: normalizeClipboardTitle(typeof item.title === 'string' ? item.title : ''),
      content: normalizeClipboardContent(typeof item.content === 'string' ? item.content : ''),
      order: typeof item.order === 'number' && Number.isFinite(item.order) ? item.order : entries.length,
      createdAt: normalizeTimestamp(item.createdAt),
      updatedAt: normalizeTimestamp(item.updatedAt),
    });
  }

  return entries
    .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    .map((entry, index) => ({ ...entry, order: index }));
}

export async function loadClipboardEntries(): Promise<ClipboardEntry[]> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return normalizeClipboardEntries(result[STORAGE_KEY]);
}

export async function saveClipboardEntries(entries: ClipboardEntry[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: normalizeClipboardEntries(entries) });
}

export function createClipboardEntry(input: { title: string; content: string }): ClipboardEntry {
  const now = Date.now();
  return {
    id: `clip-${now}-${Math.random().toString(36).slice(2, 10)}`,
    title: normalizeClipboardTitle(input.title),
    content: normalizeClipboardContent(input.content),
    order: Number.MAX_SAFE_INTEGER - 1,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateClipboardEntry(
  entries: ClipboardEntry[],
  id: string,
  changes: Partial<Pick<ClipboardEntry, 'title' | 'content'>>,
): ClipboardEntry[] {
  return entries.map(entry => entry.id !== id ? entry : {
    ...entry,
    title: changes.title !== undefined ? normalizeClipboardTitle(changes.title) : entry.title,
    content: changes.content !== undefined ? normalizeClipboardContent(changes.content) : entry.content,
    updatedAt: Date.now(),
  });
}

export function deleteClipboardEntry(entries: ClipboardEntry[], id: string): ClipboardEntry[] {
  return normalizeClipboardEntries(entries.filter(entry => entry.id !== id));
}

export function getClipboardRecords(entries: ClipboardEntry[], query = ''): ClipboardEntry[] {
  const keyword = query.trim().toLowerCase();
  return entries
    .filter(entry => !keyword || `${entry.title}\n${entry.content}`.toLowerCase().includes(keyword))
    .sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt || a.id.localeCompare(b.id));
}
