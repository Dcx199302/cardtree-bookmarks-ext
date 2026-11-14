import { forwardRef } from 'react';
import { WorkspaceSearch, type WorkspaceSearchRef } from './WorkspaceSearch';
import type { SearchEngine } from './searchEnginesStore';

export type InlineSearchRef = WorkspaceSearchRef;

interface InlineSearchProps {
  engines: SearchEngine[];
  onOpenEngineSettings: () => void;
}

/** 书签页内容区的紧凑搜索引擎搜索条。 */
export const InlineSearch = forwardRef<InlineSearchRef, InlineSearchProps>(function InlineSearch({ engines, onOpenEngineSettings }, ref) {
  return (
    <WorkspaceSearch
      ariaLabel="书签页搜索"
      className="workspace-search--inline"
      engines={engines}
      onOpenEngineSettings={onOpenEngineSettings}
      shortcutLabel="f"
      ref={ref}
    />
  );
});
