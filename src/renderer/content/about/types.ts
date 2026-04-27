export type AboutBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'table'; headers: string[]; rows: string[][] }

export interface AboutSection {
  id: string
  title: string
  blocks: AboutBlock[]
}

export interface AboutContent {
  intro: string
  sections: AboutSection[]
}
