import { ClipboardRail } from './ClipboardRail';
import { TabArchiveRail } from './TabArchiveRail';

export function BookmarkUtilitiesRail({ hidden }: { hidden: boolean }) {
  if (hidden) return null;

  return (
    <aside className="utility-rail" aria-label="标签存档与剪贴板">
      <div className="utility-rail__panel">
        <TabArchiveRail />
        <ClipboardRail />
      </div>
    </aside>
  );
}
