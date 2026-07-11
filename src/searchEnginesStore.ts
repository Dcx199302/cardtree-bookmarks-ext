// 外部搜索引擎持久化模块
export interface SearchEngine {
  id: string;          // 内置引擎固定 id；自定义引擎用时间戳
  name: string;        // 显示名："百度"
  searchUrl: string;   // 带 %s 占位符的模板：https://www.baidu.com/s?wd=%s
  builtin: boolean;    // true = 内置（渲染嵌入式 SVG 品牌图标）
  iconUrl?: string;    // 自定义引擎取 favicon 的页面 URL；为空则用 searchUrl 的域名
  enabled: boolean;    // 是否显示在快捷栏
}

const STORAGE_KEY = 'searchEngines';
export const MAX_VISIBLE = 8;

// ── 默认内置引擎 ──
const BUILTIN_DEFAULTS: SearchEngine[] = [
  { id: 'baidu', name: '百度', searchUrl: 'https://www.baidu.com/s?wd=%s', builtin: true, enabled: true },
  { id: 'google', name: 'Google', searchUrl: 'https://www.google.com/search?q=%s', builtin: true, enabled: true },
  { id: 'bing', name: '必应', searchUrl: 'https://www.bing.com/search?q=%s', builtin: true, enabled: true },
  { id: 'github', name: 'GitHub', searchUrl: 'https://github.com/search?q=%s', builtin: true, enabled: true },
  { id: 'zhihu', name: '知乎', searchUrl: 'https://www.zhihu.com/search?q=%s&type=content', builtin: true, enabled: true },
  { id: 'bilibili', name: '哔哩哔哩', searchUrl: 'https://search.bilibili.com/all?keyword=%s', builtin: true, enabled: true },
  { id: 'wikipedia', name: '维基百科', searchUrl: 'https://zh.wikipedia.org/w/index.php?search=%s', builtin: true, enabled: true },
  { id: 'mdn', name: 'MDN', searchUrl: 'https://developer.mozilla.org/zh-CN/search?q=%s', builtin: true, enabled: true },
];

// ── 读取（首装或缺少新增内置引擎时自动补全） ──
export async function loadSearchEngines(): Promise<SearchEngine[]> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const stored: SearchEngine[] | undefined = result[STORAGE_KEY];

  if (!stored || !Array.isArray(stored) || stored.length === 0) {
    await chrome.storage.local.set({ [STORAGE_KEY]: BUILTIN_DEFAULTS });
    return BUILTIN_DEFAULTS.map(e => ({ ...e }));
  }

  // 合并：确保所有内置引擎存在（新增版本追加时兼容）
  const existingBuiltinIds = new Set(stored.filter(e => e.builtin).map(e => e.id));
  const missing = BUILTIN_DEFAULTS.filter(d => !existingBuiltinIds.has(d.id));
  const merged = [...stored, ...missing.map(e => ({ ...e }))];

  if (missing.length > 0) {
    await chrome.storage.local.set({ [STORAGE_KEY]: merged });
  }
  return merged;
}

export async function saveSearchEngines(engines: SearchEngine[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: engines });
}

export function resetToDefaults(): SearchEngine[] {
  return BUILTIN_DEFAULTS.map(e => ({ ...e }));
}

// ── URL 构建 ──
export function buildSearchUrl(engine: SearchEngine, query: string): string {
  const q = query.trim();
  if (q) {
    return engine.searchUrl.replace('%s', encodeURIComponent(q));
  }
  // 无查询词时打开引擎首页
  try {
    return new URL(engine.searchUrl).origin;
  } catch {
    return engine.searchUrl;
  }
}

export function genEngineId(): string {
  return `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
