import { useEffect } from 'react'
import { useSettingsStore } from '../stores/settings'

/**
 * Applies the selected theme (light/dark/auto) to <html> element.
 * CSS variables in index.css are overridden by the .dark class.
 */
export function useTheme() {
  const theme = useSettingsStore((s) => s.ui.theme)

  useEffect(() => {
    const root = document.documentElement

    function apply(dark: boolean) {
      root.classList.toggle('dark', dark)
    }

    if (theme === 'dark') {
      apply(true)
      return
    }

    if (theme === 'light') {
      apply(false)
      return
    }

    // auto: follow system preference
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    apply(mq.matches)

    const handler = (e: MediaQueryListEvent) => apply(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])
}
