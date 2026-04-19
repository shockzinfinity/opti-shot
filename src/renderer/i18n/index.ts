import { en } from './en'
import { ko } from './ko'
import { ja } from './ja'

export type TranslationKey = keyof typeof en

const translations: Record<string, Record<string, string>> = { en, ko, ja }

let currentLang = 'ko'

export function setLanguage(lang: string): void {
  currentLang = lang
}

export function getLanguage(): string {
  return currentLang
}

export function t(key: TranslationKey): string {
  return translations[currentLang]?.[key] ?? translations['en']?.[key] ?? key
}
