export type PageId = 'bookmarks' | 'workspace';

export interface PageDefinition {
  id: PageId;
  title: string;
  description: string;
}

/** 分页数量当前固定为两页；后续新增页面时只需要扩展这里与页面渲染映射。 */
export const PAGES: PageDefinition[] = [
  { id: 'bookmarks', title: '书签', description: '书签树、搜索与文件夹导航' },
  { id: 'workspace', title: '功能页', description: '预留扩展页面' },
];

export const DEFAULT_PAGE_ORDER: PageId[] = ['bookmarks', 'workspace'];
