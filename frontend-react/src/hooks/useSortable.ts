import { useState, useMemo } from 'react';

export type SortDir = 'asc' | 'desc' | null;

/**
 * 前端表格排序 hook。
 * 点击同一列在 升序 → 降序 → 取消 间循环。
 * 用法：
 *   const { sorted, sortKey, sortDir, toggleSort } = useSortable(items);
 *   表头 onClick={() => toggleSort('name')}
 */
export function useSortable<T extends Record<string, any>>(items: T[], initialKey?: keyof T) {
  const [sortKey, setSortKey] = useState<keyof T | null>(initialKey ?? null);
  const [sortDir, setSortDir] = useState<SortDir>(initialKey ? 'asc' : null);

  const toggleSort = (key: keyof T) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir('asc');
      return;
    }
    // 同列循环：asc -> desc -> 取消
    if (sortDir === 'asc') {
      setSortDir('desc');
    } else if (sortDir === 'desc') {
      setSortKey(null);
      setSortDir(null);
    } else {
      setSortDir('asc');
    }
  };

  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return items;
    const arr = [...items];
    arr.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return av - bv;
      return String(av).localeCompare(String(bv), 'zh');
    });
    return sortDir === 'desc' ? arr.reverse() : arr;
  }, [items, sortKey, sortDir]);

  return { sorted, sortKey, sortDir, toggleSort };
}

export default useSortable;
