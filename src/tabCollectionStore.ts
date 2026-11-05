export interface SavedTabItem {
  id: string;
  title: string;
  url: string;
}

export interface TabCollection {
  id: string;
  title: string;
  createdAt: number;
  tabs: SavedTabItem[];
}

const STORAGE_KEY = 'workspaceTabCollections';
export const MAX_COLLECTIONS = 30;
export const MAX_TABS_PER_COLLECTION = 100;
const MAX_TITLE_LENGTH = 120;

export function normalizeTabTitle(raw: string): string {
  const value = raw.trim().slice(0, MAX_TITLE_LENGTH);
  return value || '未命名标签';
}

function normalizeUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  try {
    return new URL(value).toString();
  } catch {
    return '';
  }
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeTabCollections(raw: unknown): TabCollection[] {
  const source = Array.isArray(raw) ? raw : [];
  const collections: TabCollection[] = [];

  for (const value of source) {
    if (typeof value !== 'object' || value === null) continue;
    const collection = value as Partial<TabCollection>;
    const id = typeof collection.id === 'string' ? collection.id : '';
    if (!id) continue;

    const rawTabs = Array.isArray(collection.tabs) ? collection.tabs : [];
    const tabs: SavedTabItem[] = [];
    const ids = new Set<string>();
    for (const rawTab of rawTabs) {
      if (typeof rawTab !== 'object' || rawTab === null) continue;
      const tab = rawTab as Partial<SavedTabItem>;
      const tabId = typeof tab.id === 'string' ? tab.id : '';
      const url = typeof tab.url === 'string' ? normalizeUrl(tab.url) : '';
      if (!tabId || ids.has(tabId) || !url) continue;
      ids.add(tabId);
      tabs.push({
        id: tabId,
        title: normalizeTabTitle(typeof tab.title === 'string' ? tab.title : ''),
        url,
      });
      if (tabs.length >= MAX_TABS_PER_COLLECTION) break;
    }

    collections.push({
      id,
      title: normalizeTabTitle(typeof collection.title === 'string' ? collection.title : ''),
      createdAt: typeof collection.createdAt === 'number' && Number.isFinite(collection.createdAt)
        ? collection.createdAt
        : Date.now(),
      tabs,
    });
    if (collections.length >= MAX_COLLECTIONS) break;
  }

  return collections.sort((a, b) => b.createdAt - a.createdAt);
}

export async function loadTabCollections(): Promise<TabCollection[]> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return normalizeTabCollections(result[STORAGE_KEY]);
}

export async function saveTabCollections(collections: TabCollection[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: normalizeTabCollections(collections) });
}

export function createTabCollection(title: string, tabs: Array<{ title: string; url: string }>): TabCollection {
  const normalizedTabs = tabs
    .map((tab, index) => ({
      id: `${createId('tab')}-${index}`,
      title: normalizeTabTitle(tab.title),
      url: normalizeUrl(tab.url),
    }))
    .filter(tab => tab.url);

  if (normalizedTabs.length === 0) throw new Error('没有可收集的标签页');
  return {
    id: createId('tabs'),
    title: normalizeTabTitle(title || `${normalizedTabs.length} 个标签页`),
    createdAt: Date.now(),
    tabs: normalizedTabs,
  };
}

export function createSavedTabItem(title: string, url: string): SavedTabItem {
  const normalizedUrl = normalizeUrl(url);
  let parsedUrl: URL | null = null;
  try {
    parsedUrl = new URL(normalizedUrl);
  } catch { /* 下方统一给出录入错误 */ }

  if (!parsedUrl || (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:')) {
    throw new Error('请输入有效的 http/https 链接');
  }
  const hostname = parsedUrl.hostname;
  return {
    id: createId('tab'),
    title: normalizeTabTitle(title || hostname),
    url: normalizedUrl,
  };
}
