import { useEffect } from 'react';

export function useTheme() {
  // Apply light theme to document on mount
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('light');
    root.classList.remove('dark');
    root.setAttribute('data-theme', 'light');
  }, []);

  return {
    theme: 'light' as const,
    resolvedTheme: 'light' as const,
  };
}
