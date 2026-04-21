import { describe, it, expect } from 'vitest'
import { mergeGroups, mergeUnion, mergeIntersection } from '@main/engine/group-merger'

const ALL_IDS = ['a', 'b', 'c', 'd', 'e']

describe('group-merger', () => {
  describe('mergeUnion', () => {
    it('should merge overlapping groups from different algorithms', () => {
      const groupsA = [['a', 'b'], ['d', 'e']]
      const groupsB = [['b', 'c'], ['d', 'e']]

      const result = mergeUnion([groupsA, groupsB], ALL_IDS)

      // a-b (A) + b-c (B) → {a,b,c} connected
      // d-e in both → {d,e}
      expect(result).toHaveLength(2)
      const sorted = result.map((g) => g.sort()).sort((a, b) => a[0].localeCompare(b[0]))
      expect(sorted[0]).toEqual(['a', 'b', 'c'])
      expect(sorted[1]).toEqual(['d', 'e'])
    })

    it('should include groups found by only one algorithm', () => {
      const groupsA = [['a', 'b']]
      const groupsB = [['c', 'd']]

      const result = mergeUnion([groupsA, groupsB], ALL_IDS)
      expect(result).toHaveLength(2)
    })

    it('should handle single algorithm set', () => {
      const groups = [['a', 'b', 'c']]
      const result = mergeUnion([groups], ALL_IDS)
      expect(result).toHaveLength(1)
      expect(result[0].sort()).toEqual(['a', 'b', 'c'])
    })

    it('should handle empty group sets', () => {
      const result = mergeUnion([[], []], ALL_IDS)
      expect(result).toHaveLength(0)
    })
  })

  describe('mergeIntersection', () => {
    it('should keep only pairs found by all algorithms', () => {
      const groupsA = [['a', 'b', 'c'], ['d', 'e']]
      const groupsB = [['a', 'b'], ['c', 'd', 'e']]

      const result = mergeIntersection([groupsA, groupsB], ALL_IDS)

      // Pairs in A: (a,b), (a,c), (b,c), (d,e)
      // Pairs in B: (a,b), (c,d), (c,e), (d,e)
      // Intersection: (a,b), (d,e)
      const sorted = result.map((g) => g.sort()).sort((a, b) => a[0].localeCompare(b[0]))
      expect(sorted).toHaveLength(2)
      expect(sorted[0]).toEqual(['a', 'b'])
      expect(sorted[1]).toEqual(['d', 'e'])
    })

    it('should return empty when no pairs intersect', () => {
      const groupsA = [['a', 'b']]
      const groupsB = [['c', 'd']]

      const result = mergeIntersection([groupsA, groupsB], ALL_IDS)
      expect(result).toHaveLength(0)
    })

    it('should handle identical groups from both algorithms', () => {
      const groups = [['a', 'b', 'c']]
      const result = mergeIntersection([groups, groups], ALL_IDS)
      expect(result).toHaveLength(1)
      expect(result[0].sort()).toEqual(['a', 'b', 'c'])
    })
  })

  describe('mergeGroups', () => {
    it('should delegate to union strategy', () => {
      const groupsA = [['a', 'b']]
      const groupsB = [['b', 'c']]
      const result = mergeGroups([groupsA, groupsB], ALL_IDS, 'union')
      expect(result).toHaveLength(1)
      expect(result[0].sort()).toEqual(['a', 'b', 'c'])
    })

    it('should delegate to intersection strategy', () => {
      const groupsA = [['a', 'b']]
      const groupsB = [['b', 'c']]
      const result = mergeGroups([groupsA, groupsB], ALL_IDS, 'intersection')
      // Only pair (b) is not a pair — no common pairs
      expect(result).toHaveLength(0)
    })

    it('should return single group set as-is', () => {
      const groups = [['a', 'b'], ['c']]
      const result = mergeGroups([groups], ALL_IDS, 'union')
      // Single element groups are filtered
      expect(result).toHaveLength(1)
      expect(result[0].sort()).toEqual(['a', 'b'])
    })

    it('should handle empty input', () => {
      expect(mergeGroups([], ALL_IDS, 'union')).toHaveLength(0)
    })
  })
})
