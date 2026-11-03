import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BackgroundSettingsSection } from './BackgroundSettingsSection';
import type { BackgroundSettings } from './backgroundSettingsStore';
import type { CustomBackgroundView } from './customBackgroundStore';

interface SettingsDialogProps {
  backgroundSettings: BackgroundSettings;
  customBackgrounds: CustomBackgroundView[];
  isUploadingBackground: boolean;
  onBackgroundSettingsChange: (patch: Partial<BackgroundSettings>) => void;
  onBackgroundUpload: (files: FileList | File[] | null) => Promise<void>;
  onCustomBackgroundDelete: (id: string) => Promise<void>;
  onClose: () => void;
}

interface SettingsSectionDefinition {
  id: string;
  label: string;
  content: ReactNode;
}

export function SettingsDialog({
  backgroundSettings,
  customBackgrounds,
  isUploadingBackground,
  onBackgroundSettingsChange,
  onBackgroundUpload,
  onCustomBackgroundDelete,
  onClose,
}: SettingsDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const sections: SettingsSectionDefinition[] = [{
    id: 'background',
    label: '背景',
    content: (
      <BackgroundSettingsSection
        settings={backgroundSettings}
        customBackgrounds={customBackgrounds}
        isUploading={isUploadingBackground}
        onChange={onBackgroundSettingsChange}
        onUpload={onBackgroundUpload}
        onDelete={onCustomBackgroundDelete}
      />
    ),
  }];
  const [activeId, setActiveId] = useState(sections[0]!.id);
  const activeSection = sections.find(section => section.id === activeId) ?? sections[0]!;

  useEffect(() => {
    closeRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="dialog-backdrop settings-backdrop"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="dialog-card settings-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <header className="settings-header">
          <div className="settings-header__main">
            <h3 id="settings-title">设置</h3>
            <span className="settings-header__status">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 13l4 4L19 7" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              自动保存
            </span>
          </div>
          <button ref={closeRef} className="settings-close" onClick={onClose} aria-label="关闭设置">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="settings-body">
          {sections.length > 1 && (
          <nav className="settings-nav" aria-label="设置分类" role="tablist">
            {sections.map(section => (
              <button
                key={section.id}
                role="tab"
                aria-selected={section.id === activeSection.id}
                aria-controls={`settings-panel-${section.id}`}
                id={`settings-tab-${section.id}`}
                className={`settings-nav__item${section.id === activeSection.id ? ' settings-nav__item--active' : ''}`}
                onClick={() => setActiveId(section.id)}
              >
                <span>{section.label}</span>
              </button>
            ))}
          </nav>
          )}
          <div
            className="settings-content"
            role="tabpanel"
            id={`settings-panel-${activeSection.id}`}
            aria-labelledby={`settings-tab-${activeSection.id}`}
          >
            {activeSection.content}
          </div>
        </div>
      </section>
    </div>
  );
}
