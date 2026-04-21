// @TASK P2-R2 - Engine module barrel export
// @SPEC CLAUDE.md#Architecture

export { computePhash, hammingDistance, dct2d } from './phash'
export { hammingDistance as hammingDistanceUtil } from './hash-utils'
export { mergeGroups, mergeUnion, mergeIntersection } from './group-merger'
export { BKTree, groupByDistance } from './bk-tree'
export type { QueryResult, DistanceFunction } from './bk-tree'
export { computeSsim, verifySsimGroup } from './ssim'
export { computeQualityScore, getExifData } from './quality'
export type { ExifData } from './quality'
export { sharpFromPath, clearHeicCache } from './heic'
export { ScanEngine } from './scan-engine'
export type {
  ScanEngineOptions,
  ScanEngineAlgorithmOptions,
  PhotoResult,
  GroupResult,
  ScanResult,
  SkippedFile,
  ProgressCallback,
} from './scan-engine'
export { computePhashBatch } from './worker'

// Legacy plugin system (to be removed after Step 4)
export { pluginRegistry } from './plugin-registry'
export type { DetectionPlugin } from './plugin-registry'
export { phashSsimPlugin } from './plugins/phash-ssim'

// New algorithm system
export { algorithmRegistry } from './algorithm-registry'
export type { HashAlgorithm, VerifyAlgorithm } from './algorithm-registry'
export { phashAlgorithm } from './algorithms/phash'
export { dhashAlgorithm } from './algorithms/dhash'
export { ssimAlgorithm } from './algorithms/ssim'
export { nmseAlgorithm } from './algorithms/nmse'
