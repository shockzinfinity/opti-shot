import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { rmSync } from 'fs'
import { nmseAlgorithm } from '@main/engine/algorithms/nmse'
import {
  generateSolidImage,
  generateNearDuplicate,
  generateGradientImage,
  getFixtureDir,
  setFixtureNamespace,
} from '../../../fixtures/generate-test-images'

const NS = 'nmse'

describe('NMSE VerifyAlgorithm', () => {
  let redPath: string
  let nearDupPath: string
  let bluePath: string
  let gradientPath: string

  beforeAll(async () => {
    setFixtureNamespace(NS)
    redPath = await generateSolidImage('nmse-red.png', { r: 255, g: 0, b: 0 })
    nearDupPath = await generateNearDuplicate(redPath, 'nmse-red-dup.png', 2)
    bluePath = await generateSolidImage('nmse-blue.png', { r: 0, g: 0, b: 255 })
    gradientPath = await generateGradientImage('nmse-gradient.png')
  })

  afterAll(() => {
    rmSync(getFixtureDir(NS), { recursive: true, force: true })
  })

  // Metadata
  it('should have valid metadata', () => {
    expect(nmseAlgorithm.id).toBe('nmse')
    expect(nmseAlgorithm.defaultThreshold).toBe(0.05)
    expect(nmseAlgorithm.version).toBe('1.0.0')
  })

  // Single image → return as-is
  it('should return single-element group unchanged', async () => {
    const result = await nmseAlgorithm.verify([redPath], 0.05)
    expect(result).toEqual([[redPath]])
  })

  // Near-duplicates should be in the same subgroup
  it('should group near-duplicates together', async () => {
    const result = await nmseAlgorithm.verify([redPath, nearDupPath], 0.05)
    expect(result.some((g) => g.length >= 2)).toBe(true)
  })

  // Very different images should be in separate subgroups
  it('should separate very different images', async () => {
    const result = await nmseAlgorithm.verify([redPath, gradientPath], 0.05)
    // Each should be in its own group (both size 1)
    expect(result.every((g) => g.length === 1)).toBe(true)
  })

  // Mixed group: near-duplicates + different → split correctly
  it('should split mixed group into subgroups', async () => {
    const result = await nmseAlgorithm.verify(
      [redPath, nearDupPath, gradientPath],
      0.05,
    )
    // red + nearDup should be grouped, gradient should be separate
    const hasLargeGroup = result.some((g) => g.length >= 2)
    const hasSingleGroup = result.some((g) => g.length === 1)
    expect(hasLargeGroup).toBe(true)
    expect(hasSingleGroup).toBe(true)
  })
})
