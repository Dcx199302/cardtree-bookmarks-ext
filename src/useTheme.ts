import { useState, useEffect } from 'react';

type Theme = 'system' | 'light' | 'dark';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('theme') as Theme) || 'system');

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.setAttribute('data-theme', 'dark');
    else if (theme === 'light') root.setAttribute('data-theme', 'light');
    else root.removeAttribute('data-theme');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const cycle = () => setTheme(t => t === 'system' ? 'dark' : t === 'dark' ? 'light' : 'system');
  const label = theme === 'system' ? '自动' : theme === 'dark' ? '深色' : '浅色';
  return { theme, cycle, label };
}
