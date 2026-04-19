import { useSettingsStore } from '@renderer/stores/settings'
import { t, setLanguage, type TranslationKey } from '@renderer/i18n'

export function useTranslation() {
  const language = useSettingsStore((s) => s.ui.language)
  setLanguage(language)
  return { t: (key: TranslationKey) => t(key), language }
}
