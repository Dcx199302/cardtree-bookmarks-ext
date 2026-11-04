import { DEFAULT_PAGE_ORDER, PAGES, type PageId } from './pageConfig';

const STORAGE_KEY = 'pageOrder';

export function normalizePageOrder(raw: unknown): PageId[] {
  const ids = new Set(PAGES.map(page => page.id));
  const source = Array.isArray(raw) ? raw.filter((id): id is PageId => typeof id === 'string' && ids.has(id as PageId)) : [];
  const order = [...new Set(source)];
  for (const page of PAGES) {
    if (!order.includes(page.id)) order.push(page.id);
  }
  return order.length === PAGES.length ? order : [...DEFAULT_PAGE_ORDER];
}

export async function loadPageOrder(): Promise<PageId[]> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return normalizePageOrder(result[STORAGE_KEY]);
}

export async function savePageOrder(order: PageId[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: normalizePageOrder(order) });
}

export function reorderPageOrder(order: PageId[], fromId: PageId, toIndex: number): PageId[] {
  const from = order.indexOf(fromId);
  if (from < 0 || toIndex < 0 || toIndex >= order.length || from === toIndex) return order;

  const next = [...order];
  const [moved] = next.splice(from, 1);
  if (!moved) return order;
  next.splice(toIndex, 0, moved);
  return next;
}
