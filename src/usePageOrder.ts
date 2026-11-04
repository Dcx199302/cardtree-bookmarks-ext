import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_PAGE_ORDER, type PageId } from './pageConfig';
import { loadPageOrder, reorderPageOrder, normalizePageOrder, savePageOrder } from './pageOrderStore';

export function usePageOrder() {
  const [order, setOrder] = useState<PageId[]>(DEFAULT_PAGE_ORDER);
  const [ready, setReady] = useState(false);
  const orderRef = useRef(order);
  orderRef.current = order;

  useEffect(() => {
    let active = true;
    loadPageOrder().then(value => {
      if (!active) return;
      setOrder(value);
      setReady(true);
    }).catch(() => {
      if (active) setReady(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName !== 'local' || !('pageOrder' in changes)) return;
      setOrder(normalizePageOrder(changes['pageOrder']?.newValue));
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const reorderOrder = useCallback((id: PageId, toIndex: number) => {
    const next = reorderPageOrder(orderRef.current, id, toIndex);
    if (next === orderRef.current) return;
    orderRef.current = next;
    setOrder(next);
    savePageOrder(next).catch(() => {});
  }, []);

  return { order, ready, reorderOrder };
}
