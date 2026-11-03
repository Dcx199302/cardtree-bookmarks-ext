import { DEFAULT_BACKGROUND_ID, getBackgroundOption } from './backgroundCatalog';

export function isCustomBackgroundId(id: string): boolean {
  return id.startsWith('custom:');
}

export interface BackgroundSettings {
  backgroundId: string;
  dim: number;
  blur: number;
}

const STORAGE_KEY = 'backgroundSettings';
export const DEFAULT_BACKGROUND_SETTINGS: BackgroundSettings = {
  backgroundId: DEFAULT_BACKGROUND_ID,
  dim: 30,
  blur: 0,
};

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

export function normalizeSettings(raw: unknown): BackgroundSettings {
  const value = typeof raw === 'object' && raw !== null ? raw as Partial<BackgroundSettings> : {};
  return {
    backgroundId: getBackgroundOption(value.backgroundId ?? '')?.id
      ?? (isCustomBackgroundId(value.backgroundId ?? '') ? value.backgroundId! : DEFAULT_BACKGROUND_ID),
    dim: clamp(value.dim, 0, 80, DEFAULT_BACKGROUND_SETTINGS.dim),
    blur: clamp(value.blur, 0, 24, DEFAULT_BACKGROUND_SETTINGS.blur),
  };
}

export async function loadBackgroundSettings(): Promise<BackgroundSettings> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return normalizeSettings(result[STORAGE_KEY]);
}

export async function saveBackgroundSettings(settings: BackgroundSettings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: normalizeSettings(settings) });
}
