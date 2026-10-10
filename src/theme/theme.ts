export type Theme = 'light' | 'dark' | 'system';
export const THEME_KEY = 'qingzuo.theme.v1';
export const LEGACY_THEME_KEY = 'labeledit.theme.v1';
export function readTheme(): Theme {
  try { const value = localStorage.getItem(THEME_KEY) ?? localStorage.getItem(LEGACY_THEME_KEY); if (value === 'light' || value === 'dark') return value; } catch { /* Storage may be unavailable in private webviews. */ }
  return 'system';
}
export function applyTheme(theme: Theme, systemDark: boolean) {
  const resolved = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  document.documentElement.style.colorScheme = resolved;
  return resolved;
}
