// @TASK P2-R2 - Quality scoring unit tests
// @SPEC CLAUDE.md#Performance-Targets
// @TEST tests/unit/engine/quality.test.ts

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { rmSync } from 'fs'
import { computeQualityScore, getExifData } from '@main/engine/quality'
import {
  generateCheckerboardImage,
  generateSolidImage,
  generateBlurredImage,
  getFixtureDir,
  setFixtureNamespace,
} from '../../fixtures/generate-test-images'

const NS = 'quality'

describe('Quality Scoring', () => {
  let sharpImagePath: string
  let blurredImagePath: string
  let solidImagePath: string

  beforeAll(async () => {
    setFixtureNamespace(NS)
    sharpImagePath = await generateCheckerboardImage(
      'quality-sharp.png',
      200,
      4,
    )
    solidImagePath = await generateSolidImage(
      'quality-solid.png',
      { r: 128, g: 128, b: 128 },
      200,
    )
    blurredImagePath = await generateBlurredImage(
      sharpImagePath,
      'quality-blurred.png',
      10,
    )
  })

  afterAll(() => {
    rmSync(getFixtureDir(NS), { recursive: true, force: true })
  })

  describe('computeQualityScore', () => {
    it('should give sharp image a higher score than blurred image', async () => {
      const sharpScore = await computeQualityScore(sharpImagePath)
      const blurredScore = await computeQualityScore(blurredImagePath)
      expect(sharpScore).toBeGreaterThan(blurredScore)
    })

    it('should return score in 0-100 range', async () => {
      const score = await computeQualityScore(sharpImagePath)
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(100)
    })

    it('should return low score for uniform/solid image', async () => {
      const score = await computeQualityScore(solidImagePath)
      // Solid images have zero Laplacian variance
      expect(score).toBeLessThan(10)
    })

    it('should return consistent scores for same image', async () => {
      const score1 = await computeQualityScore(sharpImagePath)
      const score2 = await computeQualityScore(sharpImagePath)
      expect(score1).toBe(score2)
    })
  })

  describe('getExifData', () => {
    it('should return width and height', async () => {
      const exif = await getExifData(sharpImagePath)
      expect(exif.width).toBe(200)
      expect(exif.height).toBe(200)
    })

    it('should return format', async () => {
      const exif = await getExifData(sharpImagePath)
      expect(exif.format).toBe('png')
    })

    it('should return fileSize greater than 0', async () => {
      const exif = await getExifData(sharpImagePath)
      expect(exif.fileSize).toBeGreaterThan(0)
    })
  })
})
