import { createContext } from 'react';
import type { MenuItem } from './ContextMenu';
import type { DialogState, FolderOption } from './BookmarkDialog';
import type { TrashItem } from './trashStore';
import type { BookmarkItem } from './bookmarks';

export interface MenuContextValue {
  openMenu: (e: React.MouseEvent, items: MenuItem[]) => void;
  setDialog: (s: DialogState | null) => void;
  confirm: (msg: string, action: () => Promise<void>) => void;
  reload: () => void;
  updateNodes: (updater: (prev: CardTreeNode<BookmarkItem[]>[]) => CardTreeNode<BookmarkItem[]>[]) => void;
  showTooltip: (e: React.MouseEvent, text: string) => void;
  hideTooltip: () => void;
  isBookmarkDragging: boolean;
  activeBookmarkDragId: string | null;
  activeBookmarkSourceFolderId: string | null;
  activeBatchDragIds: string[];
  dragPreview: { folderId: string; dropIndex: number } | null;
  beginBookmarkPointerDrag: (start: BookmarkPointerDragStart) => void;
  markBookmarkDragCompleted: () => void;
  shouldSuppressBookmarkClick: () => boolean;
  moveBookmarkBetweenFolders: (bookmarkId: string, sourceFolderId: string, targetFolderId: string, dropIndex: number) => void;
  getFolderDisplaySize: (folderId: string, defaultLarge: boolean) => boolean;
  toggleFolderDisplaySize: (folderId: string, defaultLarge?: boolean) => void;
  folderOptions: FolderOption[];
  moveBookmarkToFolder: (bookmarkId: string, sourceFolderId: string, targetFolderId: string) => void;
  openBookmarks: (ids: string[]) => void;
  selectedIds: Set<string>;
  toggleBookmarkSelection: (id: string) => void;
  rangeSelectBookmarks: (folderId: string, targetId: string) => void;
  clearSelection: () => void;
  beginRubberBand: (e: React.PointerEvent, folderId: string) => void;
  trashItems: TrashItem[];
  refreshTrash: () => void;
  focusedBookmarkId: string | null;
  prefocusedBookmarkId: string | null;
  setPrefocusedBookmarkId: (id: string | null) => void;
}

import type { CardTreeNode } from '@xuchengdong/cardtree-react';

export interface BookmarkPointerDragStart {
  pointerId: number;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  sourceFolderId: string;
  bookmark: BookmarkItem;
  large: boolean;
  batchBookmarkIds?: string[];
}

export interface ActiveBookmarkDrag extends BookmarkPointerDragStart {
  currentX: number;
  currentY: number;
}

export interface RubberBandState {
  folderId: string;
  originX: number;
  originY: number;
  currentX: number;
  currentY: number;
}

export const MenuContext = createContext<MenuContextValue | null>(null);
