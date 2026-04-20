import type { PluginInfo } from '@shared/plugins'

/**
 * DetectionPlugin: Encapsulates a complete duplicate detection strategy.
 *
 * Stage 1 (required): Hash computation + distance metric for BK-Tree grouping
 * Stage 2 (optional): Verification of candidate groups (e.g. SSIM)
 */
export interface DetectionPlugin {
  readonly id: string
  readonly name: string
  readonly description: string
  /** Detailed technical explanation shown in tooltip */
  readonly detailDescription: string
  readonly version: string
  readonly builtIn: boolean

  /** Stage 1: Compute a perceptual hash for an image file. */
  computeHash(imagePath: string): Promise<string>

  /** Stage 1: Compute distance between two hashes (metric space). */
  computeDistance(hash1: string, hash2: string): number

  /** Default threshold for Stage 1 grouping. */
  readonly defaultHashThreshold: number

  /** Stage 2: Verify candidate group and return refined subgroups. */
  verify?(imagePaths: string[], threshold: number): Promise<string[][]>

  /** Default threshold for Stage 2 verification. */
  readonly defaultVerifyThreshold?: number
}

/**
 * PluginRegistry: Manages detection algorithm plugins.
 *
 * Tracks registered plugins and their enabled/disabled state.
 * Persists enabled state via settings service.
 */
export class PluginRegistry {
  private plugins = new Map<string, DetectionPlugin>()
  private enabledState = new Map<string, boolean>()

  register(plugin: DetectionPlugin): void {
    this.plugins.set(plugin.id, plugin)
    if (!this.enabledState.has(plugin.id)) {
      this.enabledState.set(plugin.id, true)
    }
  }

  get(id: string): DetectionPlugin | undefined {
    return this.plugins.get(id)
  }

  getEnabled(): DetectionPlugin[] {
    return Array.from(this.plugins.values())
      .filter((p) => this.enabledState.get(p.id) === true)
  }

  setEnabled(id: string, enabled: boolean): void {
    if (!this.plugins.has(id)) {
      throw new Error(`Unknown plugin: ${id}`)
    }
    this.enabledState.set(id, enabled)
  }

  isEnabled(id: string): boolean {
    return this.enabledState.get(id) ?? false
  }

  list(): PluginInfo[] {
    return Array.from(this.plugins.values()).map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      detailDescription: p.detailDescription,
      version: p.version,
      enabled: this.enabledState.get(p.id) ?? false,
      builtIn: p.builtIn,
      defaultHashThreshold: p.defaultHashThreshold,
      defaultVerifyThreshold: p.defaultVerifyThreshold ?? null,
    }))
  }

  /** Load enabled state from persisted settings. */
  loadState(enabledPlugins: Record<string, boolean>): void {
    for (const [id, enabled] of Object.entries(enabledPlugins)) {
      if (this.plugins.has(id)) {
        this.enabledState.set(id, enabled)
      }
    }
  }

  /** Export enabled state for persistence. */
  exportState(): Record<string, boolean> {
    const state: Record<string, boolean> = {}
    for (const [id, enabled] of this.enabledState) {
      state[id] = enabled
    }
    return state
  }
}

/** Singleton registry instance. */
export const pluginRegistry = new PluginRegistry()
