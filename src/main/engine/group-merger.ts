/**
 * Group merger: combines candidate groups from multiple hash algorithms
 * using Union-Find with Union or Intersection strategy.
 */

// --- Union-Find ---

class UnionFind {
  private parent = new Map<string, string>()
  private rank = new Map<string, number>()

  find(x: string): string {
    if (!this.parent.has(x)) {
      this.parent.set(x, x)
      this.rank.set(x, 0)
    }
    let root = x
    while (this.parent.get(root) !== root) {
      root = this.parent.get(root)!
    }
    // Path compression
    let current = x
    while (current !== root) {
      const next = this.parent.get(current)!
      this.parent.set(current, root)
      current = next
    }
    return root
  }

  union(x: string, y: string): void {
    const rootX = this.find(x)
    const rootY = this.find(y)
    if (rootX === rootY) return

    const rankX = this.rank.get(rootX) ?? 0
    const rankY = this.rank.get(rootY) ?? 0

    if (rankX < rankY) {
      this.parent.set(rootX, rootY)
    } else if (rankX > rankY) {
      this.parent.set(rootY, rootX)
    } else {
      this.parent.set(rootY, rootX)
      this.rank.set(rootX, rankX + 1)
    }
  }

  /** Extract connected components with 2+ members. */
  groups(allIds: string[]): string[][] {
    const groupMap = new Map<string, string[]>()
    for (const id of allIds) {
      const root = this.find(id)
      if (!groupMap.has(root)) {
        groupMap.set(root, [])
      }
      groupMap.get(root)!.push(id)
    }
    return Array.from(groupMap.values()).filter((g) => g.length >= 2)
  }
}

// --- Pair extraction ---

/** Extract all unique pairs from a group. */
function groupToPairs(group: string[]): Set<string> {
  const pairs = new Set<string>()
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      const a = group[i]
      const b = group[j]
      pairs.add(a < b ? `${a}|${b}` : `${b}|${a}`)
    }
  }
  return pairs
}

// --- Merge strategies ---

/**
 * Union merge: any algorithm considers a pair similar → include.
 * Broadest coverage, relies on Stage 2 to filter false positives.
 */
export function mergeUnion(groupSets: string[][][], allIds: string[]): string[][] {
  const uf = new UnionFind()

  for (const groups of groupSets) {
    for (const group of groups) {
      for (let i = 1; i < group.length; i++) {
        uf.union(group[0], group[i])
      }
    }
  }

  return uf.groups(allIds)
}

/**
 * Intersection merge: all algorithms must consider a pair similar → include.
 * Most precise, may miss some duplicates.
 */
export function mergeIntersection(groupSets: string[][][], allIds: string[]): string[][] {
  if (groupSets.length === 0) return []
  if (groupSets.length === 1) return groupSets[0].filter((g) => g.length >= 2)

  // Extract pairs from each algorithm's groups
  const pairSets = groupSets.map((groups) => {
    const allPairs = new Set<string>()
    for (const group of groups) {
      for (const pair of groupToPairs(group)) {
        allPairs.add(pair)
      }
    }
    return allPairs
  })

  // Intersection: keep only pairs present in ALL algorithms
  const intersected = new Set<string>()
  for (const pair of pairSets[0]) {
    if (pairSets.every((ps) => ps.has(pair))) {
      intersected.add(pair)
    }
  }

  // Rebuild groups from intersected pairs via Union-Find
  const uf = new UnionFind()
  for (const pair of intersected) {
    const [a, b] = pair.split('|')
    uf.union(a, b)
  }

  return uf.groups(allIds)
}

/**
 * Merge candidate groups from multiple hash algorithms.
 */
export function mergeGroups(
  groupSets: string[][][],
  allIds: string[],
  strategy: 'union' | 'intersection',
): string[][] {
  if (groupSets.length === 0) return []
  if (groupSets.length === 1) return groupSets[0].filter((g) => g.length >= 2)

  return strategy === 'union'
    ? mergeUnion(groupSets, allIds)
    : mergeIntersection(groupSets, allIds)
}
