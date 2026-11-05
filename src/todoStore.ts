export interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  completedAt: number | null;
  createdAt: number;
}

const STORAGE_KEY = 'workspaceTodos';
const MAX_TODO_ITEMS = 100;
const MAX_TODO_TEXT_LENGTH = 160;

function normalizeTodoText(raw: string): string {
  return raw.trim().slice(0, MAX_TODO_TEXT_LENGTH);
}

export function normalizeTodoItems(raw: unknown): TodoItem[] {
  const source = Array.isArray(raw) ? raw : [];
  const items: TodoItem[] = [];
  const ids = new Set<string>();

  for (const value of source) {
    if (typeof value !== 'object' || value === null) continue;
    const item = value as Partial<TodoItem>;
    const id = typeof item.id === 'string' ? item.id : '';
    const text = typeof item.text === 'string' ? normalizeTodoText(item.text) : '';
    if (!id || ids.has(id) || !text) continue;

    ids.add(id);
    const completed = item.completed === true;
    items.push({
      id,
      text,
      completed,
      completedAt: completed && typeof item.completedAt === 'number' && Number.isFinite(item.completedAt)
        ? item.completedAt
        : completed
          ? Date.now()
          : null,
      createdAt: typeof item.createdAt === 'number' && Number.isFinite(item.createdAt)
        ? item.createdAt
        : Date.now(),
    });
    if (items.length >= MAX_TODO_ITEMS) break;
  }

  return items.sort((a, b) => a.createdAt - b.createdAt);
}

export async function loadTodoItems(): Promise<TodoItem[]> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return normalizeTodoItems(result[STORAGE_KEY]);
}

export async function saveTodoItems(items: TodoItem[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: normalizeTodoItems(items) });
}

export function createTodoItem(text: string): TodoItem {
  const normalized = normalizeTodoText(text);
  if (!normalized) throw new Error('待办内容不能为空');
  return {
    id: `todo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text: normalized,
    completed: false,
    completedAt: null,
    createdAt: Date.now(),
  };
}

export function editTodoItem(items: TodoItem[], id: string, text: string): TodoItem[] {
  const normalized = normalizeTodoText(text);
  if (!normalized) return items;
  return items.map(item => item.id === id ? { ...item, text: normalized } : item);
}
