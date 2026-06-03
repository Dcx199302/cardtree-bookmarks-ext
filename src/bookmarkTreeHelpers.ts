import type { CardTreeNode } from '@xuchengdong/cardtree-react';
import type { BookmarkItem } from './bookmarks';

// ── Selection Helpers ──

export function toggleSelection(prev: Set<string>, id: string): Set<string> {
  const next = new Set(prev);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function rangeSelect(
  bookmarks: BookmarkItem[],
  anchorId: string | null,
  targetId: string,
): Set<string> {
  const anchorIdx = anchorId ? bookmarks.findIndex(b => b.id === anchorId) : -1;
  const targetIdx = bookmarks.findIndex(b => b.id === targetId);
  if (anchorIdx < 0 || targetIdx < 0) return new Set([targetId]);
  const start = Math.min(anchorIdx, targetIdx);
  const end = Math.max(anchorIdx, targetIdx);
  const ids = new Set<string>();
  for (let i = start; i <= end; i++) ids.add(bookmarks[i]!.id);
  return ids;
}

export function findBookmarkFolderId(
  nodes: CardTreeNode<BookmarkItem[]>[],
  bookmarkId: string,
): string | null {
  for (const n of nodes) {
    if ((n.data ?? []).some(b => b.id === bookmarkId)) return n.id;
    const found = findBookmarkFolderId(n.children, bookmarkId);
    if (found) return found;
  }
  return null;
}

// ── Tree Filtering ──

export function filterTree(nodes: CardTreeNode<BookmarkItem[]>[], query: string): CardTreeNode<BookmarkItem[]>[] {
  const lower = query.toLowerCase();
  function filterNode(node: CardTreeNode<BookmarkItem[]>): CardTreeNode<BookmarkItem[]> | null {
    const labelMatch = node.label.toLowerCase().includes(lower);
    if (labelMatch) {
      return {
        id: node.id,
        label: node.label,
        data: node.data,
        children: node.children,
        content: (node.data?.length ?? 0) > 0 ? `${node.data!.length} 个书签` : '',
      };
    }

    const matchedData = (node.data ?? []).filter(
      bm => bm.title.toLowerCase().includes(lower) || bm.url.toLowerCase().includes(lower)
    );
    const matchedChildren = node.children
      .map(child => filterNode(child))
      .filter((n): n is CardTreeNode<BookmarkItem[]> => n !== null);

    if (matchedData.length === 0 && matchedChildren.length === 0) return null;

    return {
      id: node.id,
      label: node.label,
      data: matchedData,
      children: matchedChildren,
      content: matchedData.length > 0 ? `${matchedData.length} 个书签` : '',
    };
  }
  return nodes.map(filterNode).filter((n): n is CardTreeNode<BookmarkItem[]> => n !== null);
}

// ── Local state update helpers (avoid full reload) ──

export function withBookmarkData(node: CardTreeNode<BookmarkItem[]>, data: BookmarkItem[]): CardTreeNode<BookmarkItem[]> {
  return { ...node, data, content: data.length > 0 ? `${data.length} 个书签` : '' };
}

export function findAndUpdateNode(
  nodes: CardTreeNode<BookmarkItem[]>[],
  nodeId: string,
  updater: (node: CardTreeNode<BookmarkItem[]>) => CardTreeNode<BookmarkItem[]>
): CardTreeNode<BookmarkItem[]>[] {
  return nodes.map(n => {
    if (n.id === nodeId) return updater(n);
    if (n.children.length > 0) {
      const updated = findAndUpdateNode(n.children, nodeId, updater);
      if (updated !== n.children) return { ...n, children: updated };
    }
    return n;
  });
}

export function findNodeInTree(nodes: CardTreeNode<BookmarkItem[]>[], nodeId: string): CardTreeNode<BookmarkItem[]> | undefined {
  for (const n of nodes) {
    if (n.id === nodeId) return n;
    const found = findNodeInTree(n.children, nodeId);
    if (found) return found;
  }
  return undefined;
}

export function addBookmarkToNodes(
  nodes: CardTreeNode<BookmarkItem[]>[],
  parentId: string,
  bookmark: BookmarkItem
): CardTreeNode<BookmarkItem[]>[] {
  return findAndUpdateNode(nodes, parentId, n => withBookmarkData(n, [...(n.data ?? []), bookmark]));
}

export function updateBookmarkInNodes(
  nodes: CardTreeNode<BookmarkItem[]>[],
  parentId: string,
  bookmarkId: string,
  title: string,
  url: string
): CardTreeNode<BookmarkItem[]>[] {
  return findAndUpdateNode(nodes, parentId, n => ({
    ...n,
    data: (n.data ?? []).map(bm => bm.id === bookmarkId ? { ...bm, title, url } : bm),
  }));
}

export function removeBookmarkFromNodes(
  nodes: CardTreeNode<BookmarkItem[]>[],
  parentId: string,
  bookmarkId: string
): CardTreeNode<BookmarkItem[]>[] {
  return findAndUpdateNode(nodes, parentId, n => withBookmarkData(n, (n.data ?? []).filter(bm => bm.id !== bookmarkId)));
}

export function addFolderToNodes(
  nodes: CardTreeNode<BookmarkItem[]>[],
  parentId: string,
  folder: CardTreeNode<BookmarkItem[]>
): CardTreeNode<BookmarkItem[]>[] {
  return findAndUpdateNode(nodes, parentId, n => ({
    ...n,
    children: [...n.children, folder],
  }));
}

export function renameFolderInNodes(
  nodes: CardTreeNode<BookmarkItem[]>[],
  nodeId: string,
  newLabel: string
): CardTreeNode<BookmarkItem[]>[] {
  return findAndUpdateNode(nodes, nodeId, n => ({ ...n, label: newLabel }));
}

export function removeFolderFromNodes(
  nodes: CardTreeNode<BookmarkItem[]>[],
  nodeId: string
): CardTreeNode<BookmarkItem[]>[] {
  function removeFromList(list: CardTreeNode<BookmarkItem[]>[]): CardTreeNode<BookmarkItem[]>[] {
    return list.filter(n => n.id !== nodeId).map(n => ({ ...n, children: removeFromList(n.children) }));
  }
  return removeFromList(nodes);
}
