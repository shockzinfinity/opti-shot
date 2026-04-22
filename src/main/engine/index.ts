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
  ScanEngineAlgorithmOptions,
  PhotoResult,
  GroupResult,
  ScanResult,
  SkippedFile,
  ProgressCallback,
} from './scan-engine'
export { computePhashBatch } from './worker'

// Algorithm system
export { algorithmRegistry } from './algorithm-registry'
export type { HashAlgorithm, VerifyAlgorithm } from './algorithm-registry'
export { phashAlgorithm } from './algorithms/phash'
export { dhashAlgorithm } from './algorithms/dhash'
export { ssimAlgorithm } from './algorithms/ssim'
export { nmseAlgorithm } from './algorithms/nmse'
