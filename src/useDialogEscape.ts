import { useEffect, useRef } from 'react';

interface EscapeStackEntry {
  id: symbol;
  onEscape: () => void;
}

// 弹窗可能叠放；Escape 只交给最后挂载的一层，避免一次按键关闭多个弹窗。
const escapeStack: EscapeStackEntry[] = [];

/**
 * 为模态弹窗提供统一的 Escape 关闭行为。
 * 回调使用 ref 保存，避免调用方每次渲染重复绑定全局监听。
 */
export function useDialogEscape(onEscape: () => void) {
  const idRef = useRef<symbol | null>(null);
  const onEscapeRef = useRef(onEscape);

  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (idRef.current == null) idRef.current = Symbol('dialog-escape');
    const id = idRef.current;
    const entry: EscapeStackEntry = {
      id,
      onEscape: () => onEscapeRef.current(),
    };

    escapeStack.push(entry);

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const topEntry = escapeStack[escapeStack.length - 1];
      if (!topEntry || topEntry.id !== id) return;

      event.preventDefault();
      event.stopPropagation();
      topEntry.onEscape();
    };

    document.addEventListener('keydown', handleKeydown, true);
    return () => {
      const index = escapeStack.findIndex(item => item.id === id);
      if (index >= 0) escapeStack.splice(index, 1);
      document.removeEventListener('keydown', handleKeydown, true);
    };
  }, []);
}
