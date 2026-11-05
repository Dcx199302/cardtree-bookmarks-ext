import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { createTodoItem, editTodoItem, loadTodoItems, normalizeTodoItems, saveTodoItems, type TodoItem } from './todoStore';

type TodoFilter = 'all' | 'active' | 'done';

const filters: Array<{ id: TodoFilter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'active', label: '进行中' },
  { id: 'done', label: '完成' },
];

export function TodoCard() {
  const [items, setItems] = useState<TodoItem[]>([]);
  const [draft, setDraft] = useState('');
  const [filter, setFilter] = useState<TodoFilter>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTodoItems().then(setItems).catch(() => setError('待办读取失败'));
  }, []);

  const commit = (rawNext: TodoItem[]) => {
    const next = normalizeTodoItems(rawNext);
    setItems(next);
    setError(null);
    saveTodoItems(next).catch(() => setError('待办保存失败'));
  };

  const handleAdd = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const item = createTodoItem(draft);
      commit([...items, item]);
      setDraft('');
      if (filter === 'done') setFilter('active');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '添加失败');
    }
  };

  const handleToggle = (id: string) => {
    commit(items.map(item => item.id === id
      ? { ...item, completed: !item.completed, completedAt: !item.completed ? Date.now() : null }
      : item));
  };

  const handleDelete = (id: string) => {
    commit(items.filter(item => item.id !== id));
    if (editingId === id) {
      setEditingId(null);
      setEditingText('');
    }
  };

  const startEdit = (item: TodoItem) => {
    setEditingId(item.id);
    setEditingText(item.text);
  };

  const saveEdit = () => {
    if (!editingId) return;
    commit(editTodoItem(items, editingId, editingText));
    setEditingId(null);
    setEditingText('');
  };

  const handleEditChange = (event: ChangeEvent<HTMLInputElement>) => {
    setEditingText(event.target.value);
  };

  const activeCount = items.filter(item => !item.completed).length;
  const completedCount = items.length - activeCount;
  const progress = items.length === 0 ? 0 : Math.round((completedCount / items.length) * 100);
  const visibleItems = useMemo(() => {
    const sorted = [...items].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return b.createdAt - a.createdAt;
    });
    if (filter === 'active') return sorted.filter(item => !item.completed);
    if (filter === 'done') return sorted.filter(item => item.completed);
    return sorted;
  }, [filter, items]);

  return (
    <section className="workspace-panel workspace-panel--todo" aria-labelledby="workspace-todo-title">
      <header className="workspace-panel__header workspace-panel__header--todo">
        <div className="workspace-panel__heading">
          <h2 id="workspace-todo-title" className="workspace-panel-title">待办</h2>
          <span className="workspace-panel-description">{activeCount} 进行中 · {completedCount} 完成</span>
        </div>
      </header>

      <div className="workspace-todo__progress" aria-label={`待办完成度 ${progress}%`}>
        <span style={{ width: `${progress}%` }} />
      </div>

      <form className="workspace-todo__form" onSubmit={handleAdd}>
        <input
          value={draft}
          placeholder="添加一件今天要推进的事…"
          aria-label="添加待办"
          onChange={event => setDraft(event.target.value)}
        />
        <button type="submit" disabled={!draft.trim()} aria-label="添加待办" title="添加待办">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 5v14M5 12h14" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>
      </form>

      <div className="workspace-todo__filters" role="group" aria-label="待办筛选">
        {filters.map(item => (
          <button
            key={item.id}
            type="button"
            className={`workspace-todo__filter${filter === item.id ? ' workspace-todo__filter--active' : ''}`}
            onClick={() => setFilter(item.id)}
            aria-pressed={filter === item.id}
          >
            {item.label}
            {item.id === 'active' && activeCount > 0 ? ` ${activeCount}` : ''}
            {item.id === 'done' && completedCount > 0 ? ` ${completedCount}` : ''}
          </button>
        ))}
      </div>

      <ul className="workspace-todo__list">
        {visibleItems.map(item => {
          const editing = editingId === item.id;
          return (
            <li key={item.id} className={`workspace-todo__item${item.completed ? ' workspace-todo__item--done' : ''}`}>
              {editing ? (
                <>
                  <input
                    value={editingText}
                    onChange={handleEditChange}
                    onKeyDown={event => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        saveEdit();
                      } else if (event.key === 'Escape') {
                        setEditingId(null);
                        setEditingText('');
                      }
                    }}
                    autoFocus
                    aria-label="编辑待办"
                  />
                  <span className="workspace-todo__actions">
                    <button type="button" className="workspace-icon-button" onClick={saveEdit} disabled={!editingText.trim()} aria-label="保存待办" title="保存待办">
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M5 13l4 4L19 7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <button type="button" className="workspace-icon-button" onClick={() => {
                      setEditingId(null);
                      setEditingText('');
                    }} aria-label="取消编辑待办" title="取消编辑待办">
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M6 6l12 12M18 6L6 18" strokeWidth="2.2" strokeLinecap="round" />
                      </svg>
                    </button>
                  </span>
                </>
              ) : (
                <>
                  <label>
                    <input type="checkbox" checked={item.completed} onChange={() => handleToggle(item.id)} />
                    <span className="workspace-todo__checkbox" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none">
                        <path d="M5 13l4 4L19 7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <span className="workspace-todo__text">{item.text}</span>
                  </label>
                  <span className="workspace-todo__actions">
                    <button type="button" className="workspace-icon-button" onClick={() => startEdit(item)} aria-label={`编辑待办 ${item.text}`} title="编辑待办">
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M4 20h4L19 9l-4-4L4 16v4z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <button type="button" className="workspace-icon-button workspace-danger-button" onClick={() => handleDelete(item.id)} aria-label={`删除待办 ${item.text}`} title="删除待办">
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </span>
                </>
              )}
            </li>
          );
        })}
        {visibleItems.length === 0 && (
          <li className="workspace-todo__empty">
            {filter === 'done' ? '暂无已完成待办' : filter === 'active' ? '今天的事项已清空' : '暂无待办'}
          </li>
        )}
      </ul>
      {error && <span className="workspace-error" role="alert">{error}</span>}
    </section>
  );
}
