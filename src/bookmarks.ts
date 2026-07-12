import type { CardTreeNode } from '@xuchengdong/cardtree-react';

export interface BookmarkItem {
  id: string;
  title: string;
  url: string;
}

// Firefox 不支持 Chrome 私有的 /_favicon/ 端点
const isFirefox =
  typeof navigator !== 'undefined' && /Firefox\/\d+/.test(navigator.userAgent);

export function getFaviconUrl(pageUrl: string, size: number = 16): string {
  try {
    const hostname = new URL(pageUrl).hostname;

    // Chrome 使用内置 favicon 服务，隐私更安全（本地解析，无网络请求）
    if (!isFirefox) {
      const u = new URL(chrome.runtime.getURL('/_favicon/'));
      u.searchParams.set('pageUrl', pageUrl);
      u.searchParams.set('size', String(size));
      return u.toString();
    }

    // Firefox 无内置 favicon API，使用 Google favicon 服务作为替代
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=${size}`;
  } catch {
    return '';
  }
}

export function getDomainFirstChar(url: string): string {
  try {
    return new URL(url).hostname.charAt(0).toUpperCase();
  } catch {
    return '?';
  }
}

function convertFolder(node: chrome.bookmarks.BookmarkTreeNode): CardTreeNode<BookmarkItem[]> | null {
  if (!node.children) return null;

  const bookmarks: BookmarkItem[] = [];
  const subFolders: chrome.bookmarks.BookmarkTreeNode[] = [];

  for (const child of node.children) {
    if (child.url) {
      bookmarks.push({
        id: child.id,
        title: child.title || new URL(child.url).hostname,
        url: child.url,
      });
    } else if (child.children) {
      subFolders.push(child);
    }
  }

  const childNodes = subFolders
    .map(convertFolder)
    .filter((n): n is CardTreeNode<BookmarkItem[]> => n !== null);

  return {
    id: node.id,
    label: node.title || '未命名文件夹',
    content: bookmarks.length > 0 ? `${bookmarks.length} 个书签` : '',
    children: childNodes,
    data: bookmarks,
  };
}

export function chromeTreeToCardNodes(nodes: chrome.bookmarks.BookmarkTreeNode[]): CardTreeNode<BookmarkItem[]>[] {
  return nodes
    .map(convertFolder)
    .filter((n): n is CardTreeNode<BookmarkItem[]> => n !== null);
}

export async function loadBookmarkTree(): Promise<CardTreeNode<BookmarkItem[]>[]> {
  const tree = await chrome.bookmarks.getTree();
  const root = tree[0];
  if (!root?.children) return [];
  return root.children
    .map(convertFolder)
    .filter((n): n is CardTreeNode<BookmarkItem[]> => n !== null);
}
