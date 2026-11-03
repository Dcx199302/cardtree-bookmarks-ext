import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_BACKGROUND_ID } from './backgroundCatalog';
import {
  DEFAULT_BACKGROUND_SETTINGS,
  isCustomBackgroundId,
  loadBackgroundSettings,
  normalizeSettings,
  saveBackgroundSettings,
  type BackgroundSettings,
} from './backgroundSettingsStore';
import {
  createCustomBackground,
  deleteCustomBackground,
  listCustomBackgrounds,
  subscribeCustomBackgroundChanges,
  type CustomBackgroundRecord,
  type CustomBackgroundView,
} from './customBackgroundStore';

const SAVE_DELAY_MS = 200;

function buildViews(records: CustomBackgroundRecord[], urls: Map<string, string>): CustomBackgroundView[] {
  return records.map(record => {
    let url = urls.get(record.id);
    if (!url) {
      url = URL.createObjectURL(record.blob);
      urls.set(record.id, url);
    }
    return {
      id: record.id,
      name: record.name,
      width: record.width,
      height: record.height,
      createdAt: record.createdAt,
      url,
    };
  });
}

export function useBackgroundSettings() {
  const [settings, setSettings] = useState<BackgroundSettings>(DEFAULT_BACKGROUND_SETTINGS);
  const [customBackgrounds, setCustomBackgrounds] = useState<CustomBackgroundView[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [ready, setReady] = useState(false);
  const objectUrlsRef = useRef(new Map<string, string>());
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const syncRecords = useCallback((records: CustomBackgroundRecord[]) => {
    const urls = objectUrlsRef.current;
    const nextIds = new Set(records.map(record => record.id));
    setCustomBackgrounds(buildViews(records, urls));
    const selected = settingsRef.current.backgroundId;
    if (isCustomBackgroundId(selected) && !nextIds.has(selected)) {
      const fallback = { ...settingsRef.current, backgroundId: DEFAULT_BACKGROUND_ID };
      settingsRef.current = fallback;
      setSettings(fallback);
      saveBackgroundSettings(fallback).catch(() => {});
    }
    for (const [id, url] of urls) {
      if (!nextIds.has(id)) {
        urls.delete(id);
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
      }
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([loadBackgroundSettings(), listCustomBackgrounds()])
      .then(([stored, records]) => {
        if (!active) return;
        syncRecords(records);
        const known = !isCustomBackgroundId(stored.backgroundId) || records.some(record => record.id === stored.backgroundId);
        const next = known ? stored : DEFAULT_BACKGROUND_SETTINGS;
        setSettings(next);
        setReady(true);
        if (!known) saveBackgroundSettings(next).catch(() => {});
      })
      .catch(() => {
        if (active) setReady(true);
      });
    return () => { active = false; };
  }, [syncRecords]);

  useEffect(() => subscribeCustomBackgroundChanges(() => {
    listCustomBackgrounds().then(syncRecords).catch(() => {});
  }), [syncRecords]);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      saveBackgroundSettings(settings).catch(() => {});
    }, SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [ready, settings]);

  useEffect(() => {
    const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName !== 'local' || !('backgroundSettings' in changes)) return;
      setSettings(normalizeSettings(changes['backgroundSettings']?.newValue));
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const updateSettings = useCallback((patch: Partial<BackgroundSettings>) => {
    setSettings(current => ({ ...current, ...patch }));
  }, []);

  const uploadCustomBackgrounds = useCallback(async (files: FileList | File[] | null) => {
    const source = Array.from(files ?? []);
    const selected = source.filter(file => file.type.startsWith('image/'));
    if (source.length > 0 && selected.length === 0) throw new Error('请选择图片文件');

    setIsUploading(true);
    try {
      let lastId: string | null = null;
      for (const file of selected) {
        const record = await createCustomBackground(file);
        const records = await listCustomBackgrounds();
        syncRecords(records);
        lastId = record.id;
      }
      if (lastId) updateSettings({ backgroundId: lastId });
    } finally {
      setIsUploading(false);
    }
  }, [syncRecords, updateSettings]);

  const removeCustomBackground = useCallback(async (id: string) => {
    const wasSelected = settingsRef.current.backgroundId === id;
    await deleteCustomBackground(id);
    const records = await listCustomBackgrounds();
    syncRecords(records);
    if (wasSelected) {
      const fallback = records[records.length - 1]?.id ?? DEFAULT_BACKGROUND_ID;
      updateSettings({ backgroundId: fallback });
    }
  }, [syncRecords, updateSettings]);

  return {
    settings,
    customBackgrounds,
    isUploading,
    updateSettings,
    uploadCustomBackgrounds,
    removeCustomBackground,
  };
}
