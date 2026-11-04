import { PAGES, type PageId } from './pageConfig';

interface PageSettingsSectionProps {
  order: PageId[];
  onOrderChange: (id: PageId, direction: -1 | 1) => void;
}

export function PageSettingsSection({ order, onOrderChange }: PageSettingsSectionProps) {
  return (
    <section className="page-settings" aria-labelledby="page-settings-title">
      <header className="settings-section-header">
        <div className="settings-section-heading">
          <h4 id="page-settings-title">页面顺序</h4>
          <p>调整左右分页的展示顺序，修改会立即生效并自动保存。</p>
        </div>
      </header>

      <div className="page-settings-list" role="list" aria-label="页面顺序">
        {order.map((id, index) => {
          const page = PAGES.find(item => item.id === id);
          if (!page) return null;
          return (
            <div className="page-settings-row" role="listitem" key={id}>
              <span className="page-settings-index" aria-hidden="true">{index + 1}</span>
              <span className="page-settings-copy">
                <span className="page-settings-title">{page.title}</span>
                <span className="page-settings-description">{page.description}</span>
              </span>
              <span className="page-settings-actions">
                <button type="button" onClick={() => onOrderChange(id, -1)} disabled={index === 0} aria-label={`上移 ${page.title}`}>
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                <button type="button" onClick={() => onOrderChange(id, 1)} disabled={index === order.length - 1} aria-label={`下移 ${page.title}`}>
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M19 12l-7 7-7-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
