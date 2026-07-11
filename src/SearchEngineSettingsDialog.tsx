import { useState, useRef } from 'react';
import type { SearchEngine } from './searchEnginesStore';
import { genEngineId, resetToDefaults } from './searchEnginesStore';
import { FaviconImg } from './FaviconImg';

interface SearchEngineSettingsDialogProps {
  engines: SearchEngine[];
  onChange: (engines: SearchEngine[]) => void;
  onClose: () => void;
}

type EditorMode = 'add' | 'edit' | null;

export function SearchEngineSettingsDialog({ engines, onChange, onClose }: SearchEngineSettingsDialogProps) {
  const [editorMode, setEditorMode] = useState<EditorMode>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formIconUrl, setFormIconUrl] = useState('');
  const [formError, setFormError] = useState('');
  // 拖拽排序
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const dragCounter = useRef(0);

  // ── 引擎列表操作 ──
  const updateEngines = (updater: (list: SearchEngine[]) => SearchEngine[]) => {
    onChange(updater([...engines]));
  };

  const toggleEnabled = (id: string) => {
    updateEngines(list => list.map(e => e.id === id ? { ...e, enabled: !e.enabled } : e));
  };

  const deleteEngine = (engine: SearchEngine) => {
    if (engine.builtin) {
      toggleEnabled(engine.id);
    } else {
      updateEngines(list => list.filter(e => e.id !== engine.id));
    }
  };

  // ── 拖拽排序 ──
  const handleDragStart = (id: string) => {
    setDragId(id);
  };
  const handleDragEnter = (id: string) => {
    if (id === dragId) return;
    setOverId(id);
    updateEngines(list => {
      const fromIdx = list.findIndex(e => e.id === dragId);
      const toIdx = list.findIndex(e => e.id === id);
      if (fromIdx < 0 || toIdx < 0) return list;
      const [moved] = list.splice(fromIdx, 1);
      list.splice(toIdx, 0, moved!);
      return list;
    });
  };
  const handleDragEnd = () => {
    setDragId(null);
    setOverId(null);
    dragCounter.current = 0;
  };

  // ── 添加/编辑表单 ──
  const openAdd = () => {
    setEditorMode('add');
    setEditId(null);
    setFormName('');
    setFormUrl('');
    setFormIconUrl('');
    setFormError('');
  };
  const openEdit = (engine: SearchEngine) => {
    setEditorMode('edit');
    setEditId(engine.id);
    setFormName(engine.name);
    setFormUrl(engine.searchUrl);
    setFormIconUrl(engine.iconUrl ?? '');
    setFormError('');
  };
  const closeEditor = () => {
    setEditorMode(null);
    setEditId(null);
    setFormError('');
  };

  const validateForm = (): { name: string; url: string; ok: boolean } => {
    const name = formName.trim();
    const url = formUrl.trim();
    if (!name) { setFormError('请输入引擎名称'); return { name, url, ok: false }; }
    if (!url) { setFormError('请输入搜索链接'); return { name, url, ok: false }; }
    if (!url.includes('%s')) { setFormError('搜索链接需包含 %s 作为关键词占位符'); return { name, url, ok: false }; }
    try { new URL(url.replace('%s', 'test')); } catch { setFormError('搜索链接格式无效'); return { name, url, ok: false }; }
    setFormError('');
    return { name, url, ok: true };
  };

  const handleSave = () => {
    const { name, url, ok } = validateForm();
    if (!ok) return;
    const iconUrl = formIconUrl.trim() || undefined;
    if (editorMode === 'add') {
      onChange([...engines, { id: genEngineId(), name, searchUrl: url, builtin: false, enabled: true, iconUrl }]);
    } else if (editorMode === 'edit' && editId) {
      updateEngines(list => list.map(e => e.id === editId ? { ...e, name, searchUrl: url, iconUrl } : e));
    }
    closeEditor();
  };

  const handleReset = () => {
    onChange(resetToDefaults());
    closeEditor();
  };

  const enabledCount = engines.filter(e => e.enabled).length;
  const showList = editorMode === null;

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog-card engine-dialog-card" onClick={e => e.stopPropagation()}>
        {showList ? (
          <>
            <div className="engine-dialog-header">
              <h3 className="dialog-title">搜索引擎管理</h3>
              <span className="engine-dialog-count">已启用 {enabledCount}/{engines.length}</span>
            </div>
            <div className="engine-dialog-list">
              {engines.map(engine => (
                <div
                  key={engine.id}
                  className={`engine-dialog-row${engine.enabled ? '' : ' engine-dialog-row--disabled'}${overId === engine.id ? ' engine-dialog-row--dragover' : ''}${dragId === engine.id ? ' engine-dialog-row--dragging' : ''}`}
                  draggable
                  onDragStart={() => handleDragStart(engine.id)}
                  onDragEnter={() => handleDragEnter(engine.id)}
                  onDragOver={e => e.preventDefault()}
                  onDragEnd={handleDragEnd}
                >
                  <span className="engine-dialog-grip" title="拖拽排序">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><circle cx="5" cy="3" r="1.3" /><circle cx="11" cy="3" r="1.3" /><circle cx="5" cy="8" r="1.3" /><circle cx="11" cy="8" r="1.3" /><circle cx="5" cy="13" r="1.3" /><circle cx="11" cy="13" r="1.3" /></svg>
                  </span>
                  <span className="engine-dialog-icon">
                    <FaviconImg url={engine.iconUrl ?? engine.searchUrl} />
                  </span>
                  <span className="engine-dialog-name">{engine.name}</span>
                  <div className="engine-dialog-row-actions">
                    <button className="engine-dialog-action" title="编辑" onClick={() => openEdit(engine)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                    </button>
                    <button className="engine-dialog-action engine-dialog-action--danger" title={engine.builtin ? '禁用' : '删除'} onClick={() => deleteEngine(engine)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                    </button>
                    <button className={`engine-dialog-toggle${engine.enabled ? ' engine-dialog-toggle--on' : ''}`} title={engine.enabled ? '已显示' : '已隐藏'} onClick={() => toggleEnabled(engine.id)}>
                      <span className="engine-dialog-toggle-knob" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="engine-dialog-footer">
              <button className="engine-dialog-add-btn" onClick={openAdd}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                添加引擎
              </button>
              <div className="engine-dialog-footer-right">
                <button className="engine-dialog-reset-btn" onClick={handleReset}>恢复默认</button>
                <button className="dialog-btn dialog-btn--cancel" onClick={onClose}>关闭</button>
              </div>
            </div>
          </>
        ) : (
          <>
            <h3 className="dialog-title">{editorMode === 'add' ? '添加搜索引擎' : '编辑引擎'}</h3>
            <div className="dialog-field">
              <label>名称</label>
              <input type="text" placeholder="例如：豆瓣" value={formName} onChange={e => setFormName(e.target.value)} autoFocus />
            </div>
            <div className="dialog-field">
              <label>搜索链接</label>
              <input type="text" placeholder="https://www.douban.com/search?q=%s" value={formUrl} onChange={e => setFormUrl(e.target.value)} />
              <span className="engine-dialog-hint">用 %s 表示搜索关键词位置</span>
            </div>
            <div className="dialog-field">
              <label>图标链接（可选）</label>
              <input type="text" placeholder="留空则自动获取站点图标" value={formIconUrl} onChange={e => setFormIconUrl(e.target.value)} />
            </div>
            {formError && <p className="engine-dialog-error">{formError}</p>}
            <div className="engine-dialog-form-actions">
              <button className="dialog-btn dialog-btn--cancel" onClick={closeEditor}>取消</button>
              <button className="dialog-btn dialog-btn--primary" onClick={handleSave}>保存</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
