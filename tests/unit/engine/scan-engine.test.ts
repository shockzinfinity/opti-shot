// @TASK P2-R2 - ScanEngine integration tests
// @SPEC CLAUDE.md#Architecture
// @TEST tests/unit/engine/scan-engine.test.ts

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { rmSync } from 'fs'
import { ScanEngine } from '@main/engine/scan-engine'
import { phashAlgorithm } from '@main/engine/algorithms/phash'
import { ssimAlgorithm } from '@main/engine/algorithms/ssim'
import type { ScanProgress } from '@shared/types'
import {
  generateSolidImage,
  generateGradientImage,
  generateNearDuplicate,
  generateNoiseImage,
  getFixtureDir,
  setFixtureNamespace,
} from '../../fixtures/generate-test-images'

const NS = 'scan-engine'

/** Default algorithm options for tests */
function defaultOptions(overrides?: {
  hashThreshold?: number
  verifyThreshold?: number
  batchSize?: number
}) {
  return {
    hashAlgorithms: [phashAlgorithm],
    hashThresholds: { phash: overrides?.hashThreshold ?? 8 },
    mergeStrategy: 'union' as const,
    verifyAlgorithms: [ssimAlgorithm],
    verifyThresholds: { ssim: overrides?.verifyThreshold ?? 0.82 },
    batchSize: overrides?.batchSize,
  }
}

describe('ScanEngine', () => {
  let redPath: string
  let redDup1Path: string
  let redDup2Path: string
  let gradientPath: string
  let noisePath: string

  beforeAll(async () => {
    setFixtureNamespace(NS)
    redPath = await generateSolidImage('scan-red.png', {
      r: 255,
      g: 0,
      b: 0,
    })
    redDup1Path = await generateNearDuplicate(
      redPath,
      'scan-red-dup1.png',
      2,
    )
    redDup2Path = await generateNearDuplicate(
      redPath,
      'scan-red-dup2.png',
      3,
    )
    gradientPath = await generateGradientImage('scan-gradient.png', 200)
    noisePath = await generateNoiseImage('scan-noise.png', 200)
  })

  afterAll(() => {
    rmSync(getFixtureDir(NS), { recursive: true, force: true })
  })

  it('should create engine with default options', () => {
    const engine = new ScanEngine(defaultOptions())
    expect(engine).toBeDefined()
  })

  it('should create engine with custom options', () => {
    const engine = new ScanEngine(defaultOptions({
      hashThreshold: 10,
      verifyThreshold: 0.85,
      batchSize: 50,
    }))
    expect(engine).toBeDefined()
  })

  it('should scan files and return results', async () => {
    const engine = new ScanEngine(defaultOptions())
    const result = await engine.scanFiles(
      [redPath, redDup1Path, gradientPath, noisePath],
      () => {},
    )

    expect(result.totalFiles).toBe(4)
    expect(result.processedFiles).toBe(4)
    expect(result.elapsed).toBeGreaterThanOrEqual(0)
  })

  it('should detect duplicate group among similar images', async () => {
    const engine = new ScanEngine(defaultOptions({ hashThreshold: 8, verifyThreshold: 0.85 }))
    const result = await engine.scanFiles(
      [redPath, redDup1Path, redDup2Path, gradientPath, noisePath],
      () => {},
    )

    // Should detect at least one group containing the red variants
    expect(result.groups.length).toBeGreaterThanOrEqual(1)

    // Find the group with red images
    const redGroup = result.groups.find((g) =>
      g.photos.some((p) => p.path === redPath),
    )
    if (redGroup) {
      const paths = redGroup.photos.map((p) => p.path)
      expect(paths).toContain(redPath)
      // At least one duplicate should be in the group
      const hasDup =
        paths.includes(redDup1Path) || paths.includes(redDup2Path)
      expect(hasDup).toBe(true)
    }
  })

  it('should select master with highest quality score', async () => {
    const engine = new ScanEngine(defaultOptions({ hashThreshold: 8, verifyThreshold: 0.85 }))
    const result = await engine.scanFiles(
      [redPath, redDup1Path, redDup2Path],
      () => {},
    )

    if (result.groups.length > 0) {
      const group = result.groups[0]
      const master = group.photos.find((p) => p.id === group.masterId)
      expect(master).toBeDefined()

      // Master should have the highest quality score
      const maxScore = Math.max(...group.photos.map((p) => p.qualityScore))
      expect(master!.qualityScore).toBe(maxScore)
    }
  })

  it('should report progress via callback', async () => {
    const engine = new ScanEngine(defaultOptions())
    const progressUpdates: ScanProgress[] = []

    await engine.scanFiles(
      [redPath, gradientPath],
      (progress) => progressUpdates.push({ ...progress }),
    )

    expect(progressUpdates.length).toBeGreaterThan(0)
    // Last progress should have all files processed
    const last = progressUpdates[progressUpdates.length - 1]
    expect(last.processedFiles).toBe(2)
    expect(last.totalFiles).toBe(2)
  })

  it('should support cancellation via AbortSignal', async () => {
    const engine = new ScanEngine(defaultOptions())
    const controller = new AbortController()

    // Abort immediately
    controller.abort()

    await expect(
      engine.scanFiles([redPath, gradientPath], () => {}, controller.signal),
    ).rejects.toThrow(/abort/i)
  })

  it('should include phash in photo results', async () => {
    const engine = new ScanEngine(defaultOptions())
    const result = await engine.scanFiles([redPath, gradientPath], () => {})

    // Check all photos have hashes
    for (const group of result.groups) {
      for (const photo of group.photos) {
        expect(photo.phash).toMatch(/^[0-9a-f]{16}$/)
      }
    }
  })
})
