const STORAGE_KEY = 'lastDrillFolderId';

/** 读取上次钻取的文件夹 ID；损坏数据统一降级为首页。 */
export async function loadLastDrillFolderId(): Promise<string | null> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const value = result[STORAGE_KEY];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

let writeQueue: Promise<void> = Promise.resolve();

/** 保存当前钻取目标；首页保存为 null。写入串行化，保证快速切换时最终值不被乱序覆盖。 */
export function saveLastDrillFolderId(folderId: string | null): Promise<void> {
  const write = writeQueue.then(() => chrome.storage.local.set({ [STORAGE_KEY]: folderId }));
  writeQueue = write.catch(() => {});
  return write;
}
