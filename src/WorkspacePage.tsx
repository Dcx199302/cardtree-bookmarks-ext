import type { SearchEngine } from './searchEnginesStore';
import { WorkspaceSearch } from './WorkspaceSearch';
import { TodoCard } from './TodoCard';
import { TabCollectionCard } from './TabCollectionCard';

interface WorkspacePageProps {
  engines: SearchEngine[];
  onOpenEngineSettings: () => void;
}

export function WorkspacePage({ engines, onOpenEngineSettings }: WorkspacePageProps) {
  return (
    <>
      {/* 搜索区作为整行背景条，不参与主体内容宽度计算。 */}
      <WorkspaceSearch engines={engines} onOpenEngineSettings={onOpenEngineSettings} />
      <div className="newtab-page-body">
        <main className="newtab-content workspace-page" aria-label="工作台">
          <div className="workspace-grid">
            <TodoCard />
            <TabCollectionCard />
          </div>
        </main>
      </div>
    </>
  );
}
