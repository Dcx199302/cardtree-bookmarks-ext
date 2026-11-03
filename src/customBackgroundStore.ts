import type { PreparedBackgroundImage } from './backgroundImageProcessing';
import { prepareBackgroundImage } from './backgroundImageProcessing';

export interface CustomBackgroundRecord {
  id: string;
  name: string;
  blob: Blob;
  width: number;
  height: number;
  createdAt: number;
}

export interface CustomBackgroundView extends Omit<CustomBackgroundRecord, 'blob'> {
  url: string;
}

export const MAX_CUSTOM_BACKGROUNDS = 12;

const DATABASE_NAME = 'cardtree-backgrounds';
const STORE_NAME = 'backgrounds';
const CHANGE_CHANNEL_NAME = 'cardtree-backgrounds-changed';
let databasePromise: Promise<IDBDatabase> | null = null;

function requestToPromise<T>(createRequest: () => IDBRequest<T>): Promise<T> {
  const request = createRequest();
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('本地背景数据库操作失败'));
  });
}

async function openDatabase(): Promise<IDBDatabase> {
  databasePromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('无法打开本地背景数据库'));
    request.onblocked = () => reject(new Error('本地背景数据库正在被其他页面使用'));
  });
  try {
    return await databasePromise;
  } catch (error) {
    databasePromise = null;
    throw error;
  }
}

function notifyChanged(): void {
  if (typeof BroadcastChannel !== 'function') return;
  const channel = new BroadcastChannel(CHANGE_CHANNEL_NAME);
  channel.postMessage({ type: 'changed' });
  window.setTimeout(() => channel.close(), 0);
}

export function subscribeCustomBackgroundChanges(handler: () => void): () => void {
  if (typeof BroadcastChannel !== 'function') return () => {};
  const channel = new BroadcastChannel(CHANGE_CHANNEL_NAME);
  channel.onmessage = event => {
    if ((event.data as { type?: string } | null)?.type === 'changed') handler();
  };
  return () => channel.close();
}

export async function listCustomBackgrounds(): Promise<CustomBackgroundRecord[]> {
  const db = await openDatabase();
  const transaction = db.transaction(STORE_NAME, 'readonly');
  const records = await requestToPromise(() => transaction.objectStore(STORE_NAME).getAll() as IDBRequest<CustomBackgroundRecord[]>);
  return records.sort((a, b) => a.createdAt - b.createdAt);
}

export async function createCustomBackground(file: File): Promise<CustomBackgroundRecord> {
  const records = await listCustomBackgrounds();
  if (records.length >= MAX_CUSTOM_BACKGROUNDS) {
    throw new Error(`最多保留 ${MAX_CUSTOM_BACKGROUNDS} 张自定义背景`);
  }

  const prepared: PreparedBackgroundImage = await prepareBackgroundImage(file);
  const record: CustomBackgroundRecord = {
    id: `custom:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: prepared.name,
    blob: prepared.blob,
    width: prepared.width,
    height: prepared.height,
    createdAt: Date.now(),
  };

  const db = await openDatabase();
  const transaction = db.transaction(STORE_NAME, 'readwrite');
  await requestToPromise(() => transaction.objectStore(STORE_NAME).put(record));
  notifyChanged();
  return record;
}

export async function deleteCustomBackground(id: string): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(STORE_NAME, 'readwrite');
  await requestToPromise(() => transaction.objectStore(STORE_NAME).delete(id));
  notifyChanged();
}
