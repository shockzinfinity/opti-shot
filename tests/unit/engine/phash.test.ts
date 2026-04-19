// @TASK P2-R2 - pHash unit tests
// @SPEC CLAUDE.md#Performance-Targets
// @TEST tests/unit/engine/phash.test.ts

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { rmSync } from 'fs'
import { computePhash, hammingDistance, dct2d } from '@main/engine/phash'
import {
  generateSolidImage,
  generateGradientImage,
  generateNearDuplicate,
  generateNoiseImage,
  getFixtureDir,
  setFixtureNamespace,
} from '../../fixtures/generate-test-images'

const NS = 'phash'

describe('pHash', () => {
  let redImagePath: string
  let blueImagePath: string
  let gradientPath: string
  let nearDupPath: string
  let noisePath: string

  beforeAll(async () => {
    setFixtureNamespace(NS)
    redImagePath = await generateSolidImage('phash-red.png', {
      r: 255,
      g: 0,
      b: 0,
    })
    blueImagePath = await generateSolidImage('phash-blue.png', {
      r: 0,
      g: 0,
      b: 255,
    })
    gradientPath = await generateGradientImage('phash-gradient.png')
    nearDupPath = await generateNearDuplicate(
      redImagePath,
      'phash-near-dup.png',
      3,
    )
    noisePath = await generateNoiseImage('phash-noise.png')
  })

  afterAll(() => {
    rmSync(getFixtureDir(NS), { recursive: true, force: true })
  })

  describe('dct2d', () => {
    it('should produce correct output for a known uniform input', () => {
      // 4x4 matrix of all ones: DC component should dominate
      const input = Array.from({ length: 4 }, () => Array(4).fill(1))
      const result = dct2d(input, 4)

      // DC component (0,0) should be positive and largest
      expect(result[0][0]).toBeGreaterThan(0)

      // All other AC components should be ~0 for uniform input
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          if (i === 0 && j === 0) continue
          expect(Math.abs(result[i][j])).toBeLessThan(1e-10)
        }
      }
    })

    it('should handle non-uniform input', () => {
      const input = [
        [1, 2, 3, 4],
        [5, 6, 7, 8],
        [9, 10, 11, 12],
        [13, 14, 15, 16],
      ]
      const result = dct2d(input, 4)

      // DC component should be sum-related
      expect(result[0][0]).toBeGreaterThan(0)
      // Result should be a 4x4 matrix
      expect(result.length).toBe(4)
      expect(result[0].length).toBe(4)
    })
  })

  describe('hammingDistance', () => {
    it('should return 0 for identical hashes', () => {
      const hash = 'abcdef0123456789'
      expect(hammingDistance(hash, hash)).toBe(0)
    })

    it('should return correct distance for known hashes', () => {
      // 0x0 = 0000, 0xf = 1111 -> 4 bits differ per hex digit
      const hash1 = '0000000000000000'
      const hash2 = '000000000000000f'
      expect(hammingDistance(hash1, hash2)).toBe(4)
    })

    it('should return 64 for completely opposite hashes', () => {
      const hash1 = '0000000000000000'
      const hash2 = 'ffffffffffffffff'
      expect(hammingDistance(hash1, hash2)).toBe(64)
    })

    it('should be symmetric', () => {
      const hash1 = 'abcdef0123456789'
      const hash2 = '1234567890abcdef'
      expect(hammingDistance(hash1, hash2)).toBe(
        hammingDistance(hash2, hash1),
      )
    })
  })

  describe('computePhash', () => {
    it('should return a 16-character hex string', async () => {
      const hash = await computePhash(redImagePath)
      expect(hash).toMatch(/^[0-9a-f]{16}$/)
    })

    it('should produce identical hashes for identical images', async () => {
      const hash1 = await computePhash(redImagePath)
      const hash2 = await computePhash(redImagePath)
      expect(hash1).toBe(hash2)
    })

    it('should produce similar hashes for near-duplicate images', async () => {
      const hash1 = await computePhash(redImagePath)
      const hash2 = await computePhash(nearDupPath)
      const distance = hammingDistance(hash1, hash2)
      // Near duplicates should have small Hamming distance
      expect(distance).toBeLessThanOrEqual(8)
    })

    it('should produce different hashes for very different images', async () => {
      const hashGradient = await computePhash(gradientPath)
      const hashNoise = await computePhash(noisePath)
      const distance = hammingDistance(hashGradient, hashNoise)
      expect(distance).toBeGreaterThan(0)
    })
  })
})
