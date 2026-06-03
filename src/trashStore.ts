export interface TrashItem {
  id: string;
  title: string;
  url: string;
  parentId: string;
  parentTitle: string;
  deletedAt: number;
}

const STORAGE_KEY = 'trashItems';
const MAX_ITEMS = 200;
const EXPIRY_DAYS = 30;
const EXPIRY_MS = EXPIRY_DAYS * 24 * 60 * 60 * 1000;
const BOOKMARK_BAR_ID = '1';
const OTHER_BOOKMARKS_ID = '2';

// ── Core CRUD ──

export async function loadTrash(): Promise<TrashItem[]> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const raw: TrashItem[] = result[STORAGE_KEY] ?? [];
  const cutoff = Date.now() - EXPIRY_MS;
  const expired = raw.filter(i => i.deletedAt <= cutoff);
  let items = expired.length > 0
    ? raw.filter(i => i.deletedAt > cutoff)
    : raw;
  const needsSave = expired.length > 0;
  const seen = new Set<string>();
  const deduped = items.filter(i => {
    if (seen.has(i.id)) return false;
    seen.add(i.id);
    return true;
  });
  items = deduped;
  if (needsSave || deduped.length !== raw.filter(i => i.deletedAt > cutoff).length) {
    await chrome.storage.local.set({ [STORAGE_KEY]: items });
  }
  return items.sort((a, b) => b.deletedAt - a.deletedAt);
}

export async function addToTrash(items: TrashItem[]): Promise<void> {
  const current = await loadTrash();
  const existingIds = new Set(current.map(i => i.id));
  const newItems = items.filter(i => !existingIds.has(i.id));
  if (newItems.length === 0) return;
  const merged = [...newItems, ...current].slice(0, MAX_ITEMS);
  await chrome.storage.local.set({ [STORAGE_KEY]: merged });
}

export async function removeFromTrash(ids: string[]): Promise<void> {
  const current = await loadTrash();
  const idSet = new Set(ids);
  await chrome.storage.local.set({ [STORAGE_KEY]: current.filter(i => !idSet.has(i.id)) });
}

export async function clearTrash(): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: [] });
}

export function collectBookmarksFromNode(
  node: chrome.bookmarks.BookmarkTreeNode,
  parentId: string,
  parentTitle: string,
): TrashItem[] {
  if (node.url) {
    return [{
      id: node.id,
      title: node.title || node.url,
      url: node.url,
      parentId,
      parentTitle,
      deletedAt: Date.now(),
    }];
  }
  if (!node.children) return [];
  const title = node.title || '未命名文件夹';
  return node.children.flatMap(child => collectBookmarksFromNode(child, node.id, title));
}

// ── Restore Helpers ──

export async function resolveRestoreParent(parentId: string): Promise<{
  targetId: string;
  isFallback: boolean;
  folderTitle: string;
}> {
  // Try original parent
  try {
    const nodes = await chrome.bookmarks.get(parentId);
    if (nodes.length > 0 && !nodes[0]!.url) {
      return { targetId: parentId, isFallback: false, folderTitle: nodes[0]!.title || parentId };
    }
  } catch {}
  // Fallback: bookmark bar
  try {
    const bar = await chrome.bookmarks.get(BOOKMARK_BAR_ID);
    if (bar.length > 0) return { targetId: BOOKMARK_BAR_ID, isFallback: true, folderTitle: bar[0]!.title || '书签栏' };
  } catch {}
  // Fallback: other bookmarks
  try {
    const other = await chrome.bookmarks.get(OTHER_BOOKMARKS_ID);
    if (other.length > 0) return { targetId: OTHER_BOOKMARKS_ID, isFallback: true, folderTitle: other[0]!.title || '其他书签' };
  } catch {}
  return { targetId: BOOKMARK_BAR_ID, isFallback: true, folderTitle: '书签栏' };
}

// ── Parent Validation ──

export async function validateTrashParents(items: TrashItem[]): Promise<{
  validMap: Map<string, boolean>;
  titleMap: Map<string, string>;
}> {
  if (items.length === 0) return { validMap: new Map(), titleMap: new Map() };

  // One call to get full tree, build id→title set
  const tree = await chrome.bookmarks.getTree();
  const folderMap = new Map<string, string>();
  function walk(nodes: chrome.bookmarks.BookmarkTreeNode[]) {
    for (const n of nodes) {
      if (!n.url) folderMap.set(n.id, n.title || '');
      if (n.children) walk(n.children);
    }
  }
  walk(tree);

  const validMap = new Map<string, boolean>();
  const titleMap = new Map<string, string>();
  const parentIds = new Set(items.map(i => i.parentId));
  for (const pid of parentIds) {
    const exists = folderMap.has(pid);
    validMap.set(pid, exists);
    titleMap.set(pid, exists ? folderMap.get(pid)! : '');
  }
  return { validMap, titleMap };
}

// ── Date Grouping ──

export interface TrashGroup {
  label: string;
  items: TrashItem[];
}

export function groupTrashByDate(items: TrashItem[]): TrashGroup[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;

  const groups: TrashGroup[] = [
    { label: '今天', items: [] },
    { label: '昨天', items: [] },
    { label: '更早', items: [] },
  ];

  for (const item of items) {
    if (item.deletedAt >= today) groups[0]!.items.push(item);
    else if (item.deletedAt >= yesterday) groups[1]!.items.push(item);
    else groups[2]!.items.push(item);
  }

  return groups.filter(g => g.items.length > 0);
}
