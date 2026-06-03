export type FolderDisplaySizeSettings = Record<string, boolean>;

const DISPLAY_KEY = 'folderDisplaySizes';
const COLLAPSED_KEY = 'folderCollapsedIds';

export async function loadFolderDisplaySettings(): Promise<FolderDisplaySizeSettings> {
  const result = await chrome.storage.local.get(DISPLAY_KEY);
  return (result[DISPLAY_KEY] as FolderDisplaySizeSettings | undefined) ?? {};
}

export async function setFolderDisplaySize(
  folderId: string,
  large: boolean,
  current: FolderDisplaySizeSettings,
): Promise<FolderDisplaySizeSettings> {
  const next = { ...current, [folderId]: large };
  await chrome.storage.local.set({ [DISPLAY_KEY]: next });
  return next;
}

export async function cleanupOrphanedSettings(
  existingFolderIds: Set<string>,
): Promise<FolderDisplaySizeSettings> {
  const current = await loadFolderDisplaySettings();
  const cleaned: FolderDisplaySizeSettings = {};
  let changed = false;
  for (const [id, val] of Object.entries(current)) {
    if (existingFolderIds.has(id)) {
      cleaned[id] = val;
    } else {
      changed = true;
    }
  }
  if (changed) await chrome.storage.local.set({ [DISPLAY_KEY]: cleaned });
  return cleaned;
}

// ── Collapse state persistence ──

export async function loadCollapsedIds(): Promise<string[]> {
  const result = await chrome.storage.local.get(COLLAPSED_KEY);
  return (result[COLLAPSED_KEY] as string[] | undefined) ?? [];
}

export async function saveCollapsedIds(ids: string[]): Promise<void> {
  await chrome.storage.local.set({ [COLLAPSED_KEY]: ids });
}

// ── NavRail order persistence ──

const NAV_RAIL_ORDER_KEY = 'navRailOrder';
export type NavRailOrder = Record<string, number>;

export async function loadNavRailOrder(): Promise<NavRailOrder> {
  const result = await chrome.storage.local.get(NAV_RAIL_ORDER_KEY);
  return (result[NAV_RAIL_ORDER_KEY] as NavRailOrder | undefined) ?? {};
}

export async function saveNavRailOrder(order: NavRailOrder): Promise<void> {
  await chrome.storage.local.set({ [NAV_RAIL_ORDER_KEY]: order });
}
