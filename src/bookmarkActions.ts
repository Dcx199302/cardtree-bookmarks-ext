export async function createBookmark(parentId: string, title: string, url: string) {
  await chrome.bookmarks.create({ parentId, title, url });
}

export async function updateBookmark(id: string, title: string, url: string) {
  await chrome.bookmarks.update(id, { title, url });
}

export async function deleteBookmark(id: string) {
  await chrome.bookmarks.remove(id);
}

export async function createFolder(parentId: string, title: string) {
  return chrome.bookmarks.create({ parentId, title });
}

export async function deleteFolder(id: string) {
  await chrome.bookmarks.removeTree(id);
}

export async function moveBookmark(id: string, parentId: string, index?: number) {
  await chrome.bookmarks.move(id, { parentId, index });
}
