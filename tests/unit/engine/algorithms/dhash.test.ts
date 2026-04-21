import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { rmSync } from 'fs'
import { dhashAlgorithm } from '@main/engine/algorithms/dhash'
import {
  generateSolidImage,
  generateNearDuplicate,
  generateGradientImage,
  getFixtureDir,
  setFixtureNamespace,
} from '../../../fixtures/generate-test-images'

const NS = 'dhash'

describe('dHash HashAlgorithm', () => {
  let redPath: string
  let bluePath: string
  let nearDupPath: string
  let gradientPath: string

  beforeAll(async () => {
    setFixtureNamespace(NS)
    redPath = await generateSolidImage('dhash-red.png', { r: 255, g: 0, b: 0 })
    bluePath = await generateSolidImage('dhash-blue.png', { r: 0, g: 0, b: 255 })
    nearDupPath = await generateNearDuplicate(redPath, 'dhash-red-dup.png', 2)
    gradientPath = await generateGradientImage('dhash-gradient.png')
  })

  afterAll(() => {
    rmSync(getFixtureDir(NS), { recursive: true, force: true })
  })

  // Metadata
  it('should have valid metadata', () => {
    expect(dhashAlgorithm.id).toBe('dhash')
    expect(dhashAlgorithm.defaultThreshold).toBe(10)
    expect(dhashAlgorithm.version).toBe('1.0.0')
  })

  // Hash format
  it('should compute hash as 16-char hex string', async () => {
    const hash = await dhashAlgorithm.computeHash(redPath)
    expect(hash).toMatch(/^[0-9a-f]{16}$/)
  })

  // Self-distance = 0
  it('should return distance 0 for identical hashes', async () => {
    const hash = await dhashAlgorithm.computeHash(redPath)
    expect(dhashAlgorithm.computeDistance(hash, hash)).toBe(0)
  })

  // Near-duplicates should be close
  it('should produce small distance for near-duplicates', async () => {
    const hash1 = await dhashAlgorithm.computeHash(redPath)
    const hash2 = await dhashAlgorithm.computeHash(nearDupPath)
    const distance = dhashAlgorithm.computeDistance(hash1, hash2)
    expect(distance).toBeLessThan(dhashAlgorithm.defaultThreshold)
  })

  // Different images should have larger distance
  it('should produce larger distance for different images', async () => {
    const hashRed = await dhashAlgorithm.computeHash(redPath)
    const hashGradient = await dhashAlgorithm.computeHash(gradientPath)
    const distance = dhashAlgorithm.computeDistance(hashRed, hashGradient)
    expect(distance).toBeGreaterThan(0)
  })

  // Symmetry: d(a, b) = d(b, a)
  it('should satisfy symmetry property', async () => {
    const hash1 = await dhashAlgorithm.computeHash(redPath)
    const hash2 = await dhashAlgorithm.computeHash(bluePath)
    expect(dhashAlgorithm.computeDistance(hash1, hash2))
      .toBe(dhashAlgorithm.computeDistance(hash2, hash1))
  })
})
