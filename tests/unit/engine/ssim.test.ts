// @TASK P2-R2 - SSIM unit tests
// @SPEC CLAUDE.md#Performance-Targets
// @TEST tests/unit/engine/ssim.test.ts

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { rmSync } from 'fs'
import { computeSsim, verifySsimGroup } from '@main/engine/ssim'
import {
  generateSolidImage,
  generateGradientImage,
  generateNoiseImage,
  generateNearDuplicate,
  getFixtureDir,
  setFixtureNamespace,
} from '../../fixtures/generate-test-images'

const NS = 'ssim'

describe('SSIM', () => {
  let redPath: string
  let redDupPath: string
  let bluePath: string
  let gradientPath: string
  let noisePath: string
  let nearDupPath: string

  beforeAll(async () => {
    setFixtureNamespace(NS)
    redPath = await generateSolidImage('ssim-red.png', {
      r: 255,
      g: 0,
      b: 0,
    })
    redDupPath = await generateSolidImage('ssim-red-dup.png', {
      r: 255,
      g: 0,
      b: 0,
    })
    bluePath = await generateSolidImage('ssim-blue.png', {
      r: 0,
      g: 0,
      b: 255,
    })
    gradientPath = await generateGradientImage('ssim-gradient.png', 200)
    noisePath = await generateNoiseImage('ssim-noise.png', 200)
    nearDupPath = await generateNearDuplicate(
      gradientPath,
      'ssim-near-dup.png',
      3,
    )
  })

  afterAll(() => {
    rmSync(getFixtureDir(NS), { recursive: true, force: true })
  })

  describe('computeSsim', () => {
    it('should return value close to 1.0 for identical images', async () => {
      const score = await computeSsim(redPath, redDupPath)
      expect(score).toBeGreaterThan(0.99)
    })

    it('should return value less than 0.5 for very different images', async () => {
      const score = await computeSsim(gradientPath, noisePath)
      expect(score).toBeLessThan(0.5)
    })

    it('should return high value for near-duplicate images', async () => {
      const score = await computeSsim(gradientPath, nearDupPath)
      expect(score).toBeGreaterThan(0.8)
    })

    it('should return value between 0 and 1', async () => {
      const score = await computeSsim(redPath, bluePath)
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(1)
    })

    it('should be symmetric', async () => {
      const score1 = await computeSsim(gradientPath, noisePath)
      const score2 = await computeSsim(noisePath, gradientPath)
      expect(Math.abs(score1 - score2)).toBeLessThan(0.01)
    })
  })

  describe('verifySsimGroup', () => {
    it('should keep identical images in the same group', async () => {
      const groups = await verifySsimGroup(
        [redPath, redDupPath],
        0.9,
      )
      expect(groups.length).toBe(1)
      expect(groups[0]).toContain(redPath)
      expect(groups[0]).toContain(redDupPath)
    })

    it('should split dissimilar images into separate groups', async () => {
      const groups = await verifySsimGroup(
        [gradientPath, noisePath],
        0.9,
      )
      // They should be split since SSIM is low
      expect(groups.length).toBe(2)
    })

    it('should handle single image input', async () => {
      const groups = await verifySsimGroup([redPath], 0.9)
      expect(groups.length).toBe(1)
      expect(groups[0]).toEqual([redPath])
    })
  })
})
