/** Plugin information exposed to Renderer (UI-safe, no function references) */
export interface PluginInfo {
  id: string
  name: string
  description: string
  /** Detailed technical explanation shown in tooltip */
  detailDescription: string
  version: string
  enabled: boolean
  builtIn: boolean
  defaultHashThreshold: number
  defaultVerifyThreshold: number | null
}
