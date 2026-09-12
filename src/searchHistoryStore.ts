// 搜索引擎历史记录 & 上次选中引擎持久化模块
const HISTORY_KEY = 'searchEngineHistory';
const LAST_ENGINE_KEY = 'lastSearchEngineId';
const LAST_MODE_KEY = 'lastSearchMode';
const MAX_HISTORY = 8;

/** 加载搜索历史 */
export async function loadSearchHistory(): Promise<string[]> {
  const result = await chrome.storage.local.get(HISTORY_KEY);
  const history = result[HISTORY_KEY];
  return Array.isArray(history) ? history : [];
}

/** 添加一条搜索历史（去重、置顶、截断） */
export async function addSearchHistory(query: string): Promise<string[]> {
  const trimmed = query.trim();
  if (!trimmed) return loadSearchHistory();
  const history = await loadSearchHistory();
  const filtered = history.filter((h: string) => h !== trimmed);
  const updated = [trimmed, ...filtered].slice(0, MAX_HISTORY);
  await chrome.storage.local.set({ [HISTORY_KEY]: updated });
  return updated;
}

/** 清除全部搜索历史 */
export async function clearSearchHistory(): Promise<void> {
  await chrome.storage.local.remove(HISTORY_KEY);
}

/** 加载上次选中的搜索引擎 id */
export async function loadLastEngineId(): Promise<string | null> {
  const result = await chrome.storage.local.get(LAST_ENGINE_KEY);
  return result[LAST_ENGINE_KEY] ?? null;
}

/** 保存上次选中的搜索引擎 id */
export async function saveLastEngineId(id: string): Promise<void> {
  await chrome.storage.local.set({ [LAST_ENGINE_KEY]: id });
}

/** 加载上次使用的搜索模式 */
export async function loadLastSearchMode(): Promise<string | null> {
  const result = await chrome.storage.local.get(LAST_MODE_KEY);
  return result[LAST_MODE_KEY] ?? null;
}

/** 保存上次使用的搜索模式 */
export async function saveLastSearchMode(mode: string): Promise<void> {
  await chrome.storage.local.set({ [LAST_MODE_KEY]: mode });
}
