/** Algorithm information exposed to Renderer (UI-safe) */
export interface AlgorithmInfo {
  id: string
  name: string
  description: string
  detailDescription: string
  version: string
  stage: 'hash' | 'verify'
  defaultThreshold: number
}
