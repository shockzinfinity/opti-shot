// @TASK P2-R2 - BK-Tree unit tests
// @SPEC CLAUDE.md#Performance-Targets
// @TEST tests/unit/engine/bk-tree.test.ts

import { describe, it, expect } from 'vitest'
import { BKTree, groupByDistance } from '@main/engine/bk-tree'
import { hammingDistance } from '@main/engine/phash'

describe('BKTree', () => {
  it('should start with size 0', () => {
    const tree = new BKTree(hammingDistance)
    expect(tree.size).toBe(0)
  })

  it('should increment size on insert', () => {
    const tree = new BKTree(hammingDistance)
    tree.insert('abcdef0123456789', 'photo-1')
    expect(tree.size).toBe(1)
    tree.insert('abcdef0123456780', 'photo-2')
    expect(tree.size).toBe(2)
  })

  it('should find exact match with distance 0', () => {
    const tree = new BKTree(hammingDistance)
    tree.insert('abcdef0123456789', 'photo-1')
    tree.insert('1234567890abcdef', 'photo-2')

    const results = tree.query('abcdef0123456789', 0)
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('photo-1')
    expect(results[0].distance).toBe(0)
  })

  it('should find similar hashes within threshold', () => {
    const tree = new BKTree(hammingDistance)
    // Insert hashes with known distances
    tree.insert('0000000000000000', 'all-zeros')
    tree.insert('000000000000000f', 'near-zero') // distance 4
    tree.insert('ffffffffffffffff', 'all-ones') // distance 64

    const results = tree.query('0000000000000000', 8)
    const ids = results.map((r) => r.id)
    expect(ids).toContain('all-zeros')
    expect(ids).toContain('near-zero')
    expect(ids).not.toContain('all-ones')
  })

  it('should return no results for threshold 0 when no exact match', () => {
    const tree = new BKTree(hammingDistance)
    tree.insert('000000000000000f', 'photo-1')

    const results = tree.query('0000000000000000', 0)
    expect(results).toHaveLength(0)
  })

  it('should return empty results from empty tree', () => {
    const tree = new BKTree(hammingDistance)
    const results = tree.query('abcdef0123456789', 10)
    expect(results).toHaveLength(0)
  })

  it('should handle multiple inserts at same distance from root', () => {
    const tree = new BKTree(hammingDistance)
    tree.insert('0000000000000000', 'root')
    // Both are distance 4 from root
    tree.insert('000000000000000f', 'child-a')
    tree.insert('00000000000000f0', 'child-b')

    expect(tree.size).toBe(3)

    const results = tree.query('0000000000000000', 4)
    const ids = results.map((r) => r.id)
    expect(ids).toContain('root')
    expect(ids).toContain('child-a')
    expect(ids).toContain('child-b')
  })

  it('should include distance in query results', () => {
    const tree = new BKTree(hammingDistance)
    tree.insert('0000000000000000', 'photo-1')

    const results = tree.query('000000000000000f', 10)
    expect(results).toHaveLength(1)
    expect(results[0].distance).toBe(4)
  })
})

describe('groupByDistance', () => {
  it('should group identical hashes together', () => {
    const items = [
      { id: 'a', hash: '0000000000000000' },
      { id: 'b', hash: '0000000000000000' },
      { id: 'c', hash: 'ffffffffffffffff' },
    ]

    const groups = groupByDistance(items, 0)
    expect(groups.length).toBeGreaterThanOrEqual(1)

    // a and b should be in the same group
    const groupWithA = groups.find((g) => g.includes('a'))
    expect(groupWithA).toContain('b')

    // c should NOT be in the same group as a
    if (groupWithA) {
      expect(groupWithA).not.toContain('c')
    }
  })

  it('should group similar hashes within threshold', () => {
    const items = [
      { id: 'a', hash: '0000000000000000' },
      { id: 'b', hash: '000000000000000f' }, // distance 4 from a
      { id: 'c', hash: 'ffffffffffffffff' }, // distance 64 from a
    ]

    const groups = groupByDistance(items, 8)
    const groupWithA = groups.find((g) => g.includes('a'))
    expect(groupWithA).toContain('b')
    if (groupWithA) {
      expect(groupWithA).not.toContain('c')
    }
  })

  it('should return no groups for single items', () => {
    const items = [
      { id: 'a', hash: '0000000000000000' },
      { id: 'b', hash: 'ffffffffffffffff' },
      { id: 'c', hash: 'aaaaaaaaaaaaaaaa' },
    ]

    // With threshold 0, no two items are identical
    const groups = groupByDistance(items, 0)
    // Groups should only contain items with matches (size >= 2)
    groups.forEach((g) => {
      expect(g.length).toBeGreaterThanOrEqual(2)
    })
  })

  it('should handle empty input', () => {
    const groups = groupByDistance([], 8)
    expect(groups).toHaveLength(0)
  })

  it('should handle single item input', () => {
    const groups = groupByDistance(
      [{ id: 'a', hash: '0000000000000000' }],
      8,
    )
    // Single item cannot form a group of >= 2
    expect(groups).toHaveLength(0)
  })
})
