import { ko } from './ko'
import type { AboutContent } from './types'

const content: Record<string, AboutContent> = { ko }

/**
 * Returns the About OptiShot content for the requested language.
 * Falls back to Korean when the language is not yet translated.
 * Adding a new language is just: import './en' and register it here.
 */
export function getAboutContent(language: string): AboutContent {
  return content[language] ?? content.ko
}

export type { AboutContent, AboutSection, AboutBlock } from './types'
