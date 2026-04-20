// @TASK P2-R2 - Engine module barrel export
// @SPEC CLAUDE.md#Architecture

export { computePhash, hammingDistance, dct2d } from './phash'
export { BKTree, groupByDistance } from './bk-tree'
export type { QueryResult, DistanceFunction } from './bk-tree'
export { computeSsim, verifySsimGroup } from './ssim'
export { computeQualityScore, getExifData } from './quality'
export type { ExifData } from './quality'
export { sharpFromPath, clearHeicCache } from './heic'
export { ScanEngine } from './scan-engine'
export type {
  ScanEngineOptions,
  PhotoResult,
  GroupResult,
  ScanResult,
  SkippedFile,
  ProgressCallback,
} from './scan-engine'
export { computePhashBatch } from './worker'

// Plugin system
export { pluginRegistry } from './plugin-registry'
export type { DetectionPlugin } from './plugin-registry'
export { phashSsimPlugin } from './plugins/phash-ssim'
