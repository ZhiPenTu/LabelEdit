import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { applyTheme, readTheme, THEME_KEY, type Theme } from './theme';
const Context = createContext<{ theme: Theme; setTheme: (theme: Theme) => void } | null>(null);
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, updateTheme] = useState<Theme>(readTheme);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => applyTheme(theme, media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [theme]);
  function setTheme(value: Theme) {
    try { localStorage.setItem(THEME_KEY, value); } catch { /* Keep the selected theme for this session. */ }
    updateTheme(value);
  }
  return <Context.Provider value={{ theme, setTheme }}>{children}</Context.Provider>;
}
export function useTheme() {
  const value = useContext(Context);
  if (!value) throw new Error('ThemeProvider is required');
  return value;
}
