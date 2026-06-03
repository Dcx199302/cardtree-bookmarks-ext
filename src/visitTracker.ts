const STORAGE_KEY = 'visitStats';

export interface VisitRecord {
  url: string;
  count: number;
  lastVisit: number;
}

export type SortMode = 'default' | 'frequency' | 'recent';

export async function loadVisitStats(): Promise<Map<string, VisitRecord>> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const records: VisitRecord[] = result[STORAGE_KEY] ?? [];
  return new Map(records.map(r => [r.url, r]));
}

export async function recordVisit(url: string): Promise<void> {
  const stats = await loadVisitStats();
  const existing = stats.get(url);
  if (existing) {
    existing.count++;
    existing.lastVisit = Date.now();
  } else {
    stats.set(url, { url, count: 1, lastVisit: Date.now() });
  }
  await persistStats(stats);
}

async function persistStats(stats: Map<string, VisitRecord>): Promise<void> {
  const records = Array.from(stats.values());
  await chrome.storage.local.set({ [STORAGE_KEY]: records });
}

export function sortBookmarksByVisit<T extends { url: string }>(
  bookmarks: T[],
  stats: Map<string, VisitRecord>,
  mode: SortMode,
): T[] {
  if (mode === 'default') return bookmarks;
  return [...bookmarks].sort((a, b) => {
    const sa = stats.get(a.url);
    const sb = stats.get(b.url);
    if (mode === 'frequency') {
      return (sb?.count ?? 0) - (sa?.count ?? 0);
    }
    // 'recent'
    return (sb?.lastVisit ?? 0) - (sa?.lastVisit ?? 0);
  });
}
