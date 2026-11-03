import { useRef, useState } from 'react';
import { BACKGROUND_OPTIONS } from './backgroundCatalog';
import { DEFAULT_BACKGROUND_SETTINGS, type BackgroundSettings } from './backgroundSettingsStore';
import { MAX_CUSTOM_BACKGROUNDS, type CustomBackgroundView } from './customBackgroundStore';

interface BackgroundSettingsSectionProps {
  settings: BackgroundSettings;
  customBackgrounds: CustomBackgroundView[];
  isUploading: boolean;
  onChange: (patch: Partial<BackgroundSettings>) => void;
  onUpload: (files: FileList | File[] | null) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function BackgroundSettingsSection({
  settings,
  customBackgrounds,
  isUploading,
  onChange,
  onUpload,
  onDelete,
}: BackgroundSettingsSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async (files: FileList | null) => {
    setError(null);
    try {
      await onUpload(files);
    } catch (error) {
      setError(error instanceof Error ? error.message : '图片上传失败');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const uploadLabel = isUploading ? '处理图片中...' : '上传图片';

  return (
    <section className="background-settings" aria-labelledby="background-settings-title">
      <header className="settings-section-header">
        <div className="settings-section-heading">
          <h4 id="background-settings-title">背景图片</h4>
          <p>选择内置图片或上传本地图片，并调整遮罩与模糊。</p>
        </div>
        <button
          className="dialog-btn dialog-btn--cancel"
          onClick={() => onChange(DEFAULT_BACKGROUND_SETTINGS)}
        >
          恢复默认
        </button>
      </header>

      <div className="background-adjustments">
        <label className="background-slider">
          <span>遮罩浓度</span>
          <input
            type="range"
            min={0}
            max={80}
            step={1}
            value={settings.dim}
            aria-valuetext={`${settings.dim}%`}
            onChange={event => onChange({ dim: Number(event.target.value) })}
          />
          <output>{settings.dim}%</output>
        </label>
        <label className="background-slider">
          <span>背景模糊</span>
          <input
            type="range"
            min={0}
            max={24}
            step={1}
            value={settings.blur}
            aria-valuetext={`${settings.blur}px`}
            onChange={event => onChange({ blur: Number(event.target.value) })}
          />
          <output>{settings.blur}px</output>
        </label>
      </div>

      <section className="background-gallery-section" aria-labelledby="builtin-backgrounds-title">
        <h5 id="builtin-backgrounds-title">内置图片</h5>
        <div className="background-options" role="radiogroup" aria-label="选择内置背景">
          {BACKGROUND_OPTIONS.map(option => {
            const checked = settings.backgroundId === option.id;
            return (
              <label
                key={option.id}
                className={`background-option${checked ? ' background-option--active' : ''}`}
              >
                <input
                  type="radio"
                  name="newtab-background"
                  value={option.id}
                  checked={checked}
                  onChange={() => onChange({ backgroundId: option.id })}
                />
                <span
                  className="background-option__preview"
                  style={option.image ? { backgroundImage: `url("${option.image}")` } : undefined}
                  aria-hidden="true"
                />
                <span className="background-option__copy">
                  <span className="background-option__title">{option.title}</span>
                  <span className="background-option__description">{option.description}</span>
                </span>
                <svg className="background-option__check" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M5 13l4 4L19 7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </label>
            );
          })}
        </div>
      </section>

      <section className="background-gallery-section" aria-labelledby="custom-backgrounds-title">
        <div className="background-gallery-heading">
          <h5 id="custom-backgrounds-title">自定义图片</h5>
          <span>{customBackgrounds.length}/{MAX_CUSTOM_BACKGROUNDS}</span>
        </div>
        <div className="background-options">
          <label className={`background-option background-option--upload${isUploading ? ' background-option--uploading' : ''}`}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              disabled={isUploading}
              onChange={event => void handleUpload(event.target.files)}
            />
            <span className="background-option__preview background-option__upload-preview" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M12 5v14M5 12h14" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>
            <span className="background-option__copy">
              <span className="background-option__title">{uploadLabel}</span>
              <span className="background-option__description">支持多选 JPG / PNG / WebP</span>
            </span>
          </label>

          <div className="background-options__custom-list" role="radiogroup" aria-label="选择自定义背景">
            {customBackgrounds.map(background => {
              const checked = settings.backgroundId === background.id;
              return (
                <label
                  key={background.id}
                  className={`background-option${checked ? ' background-option--active' : ''}`}
                >
                  <input
                    type="radio"
                    name="newtab-background"
                    value={background.id}
                    checked={checked}
                    onChange={() => onChange({ backgroundId: background.id })}
                  />
                  <span
                    className="background-option__preview"
                    style={{ backgroundImage: `url("${background.url}")` }}
                    aria-hidden="true"
                  />
                  <span className="background-option__copy">
                    <span className="background-option__title">{background.name}</span>
                    <span className="background-option__description">{background.width}×{background.height}</span>
                  </span>
                  <svg className="background-option__check" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M5 13l4 4L19 7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <button
                    type="button"
                    className="background-option__delete"
                    aria-label={`删除 ${background.name}`}
                    onClick={event => {
                      event.preventDefault();
                      event.stopPropagation();
                      setError(null);
                      onDelete(background.id).catch(err => {
                        setError(err instanceof Error ? err.message : '删除背景失败');
                      });
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M6 6l12 12M18 6L6 18" strokeWidth="2.2" strokeLinecap="round" />
                    </svg>
                  </button>
                </label>
              );
            })}
          </div>
        </div>
        {error && <p className="background-settings__error">{error}</p>}
        <p className="background-settings__hint">自定义图片会自动压缩并仅保存在本设备。</p>
      </section>

    </section>
  );
}
