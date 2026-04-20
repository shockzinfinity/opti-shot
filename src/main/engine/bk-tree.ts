// @TASK P2-R2 - BK-Tree for efficient similarity grouping
// @SPEC CLAUDE.md#Architecture — BK-Tree: Group images by Hamming distance

/** Distance function type: computes metric distance between two items. */
export type DistanceFunction = (a: string, b: string) => number

interface BKTreeNode {
  hash: string
  id: string
  children: Map<number, BKTreeNode>
}

export interface QueryResult {
  id: string
  hash: string
  distance: number
}

/**
 * BK-Tree (Burkhard-Keller Tree) for efficient near-neighbor search
 * in metric spaces. Uses Hamming distance as the metric.
 */
export class BKTree {
  private root: BKTreeNode | null = null
  private _size = 0
  private distanceFn: DistanceFunction

  constructor(distanceFn: DistanceFunction) {
    this.distanceFn = distanceFn
  }

  get size(): number {
    return this._size
  }

  /**
   * Insert a hash with its associated ID into the tree.
   */
  insert(hash: string, id: string): void {
    const node: BKTreeNode = { hash, id, children: new Map() }

    if (this.root === null) {
      this.root = node
      this._size++
      return
    }

    let current = this.root
    while (true) {
      const distance = this.distanceFn(current.hash, hash)
      const child = current.children.get(distance)
      if (child === undefined) {
        current.children.set(distance, node)
        this._size++
        return
      }
      current = child
    }
  }

  /**
   * Find all entries within `threshold` distance of the query hash.
   * Returns array of { id, hash, distance }.
   */
  query(hash: string, threshold: number): QueryResult[] {
    if (this.root === null) return []

    const results: QueryResult[] = []
    const stack: BKTreeNode[] = [this.root]

    while (stack.length > 0) {
      const node = stack.pop()!
      const distance = this.distanceFn(node.hash, hash)

      if (distance <= threshold) {
        results.push({ id: node.id, hash: node.hash, distance })
      }

      // BK-tree property: only check children where edge distance d
      // satisfies |d - distance| <= threshold (triangle inequality)
      const minDist = distance - threshold
      const maxDist = distance + threshold

      for (const [edge, child] of node.children) {
        if (edge >= minDist && edge <= maxDist) {
          stack.push(child)
        }
      }
    }

    return results
  }
}

/**
 * Group items by pairwise distance within a threshold.
 * Uses union-find to merge overlapping groups.
 *
 * Only returns groups with 2 or more members (duplicates/near-duplicates).
 */
export function groupByDistance(
  items: Array<{ id: string; hash: string }>,
  threshold: number,
  distFn: DistanceFunction,
): string[][] {
  if (items.length < 2) return []

  // Build BK-tree
  const tree = new BKTree(distFn)
  for (const item of items) {
    tree.insert(item.hash, item.id)
  }

  // Union-Find data structure
  const parent = new Map<string, string>()
  const rank = new Map<string, number>()

  function find(x: string): string {
    if (!parent.has(x)) {
      parent.set(x, x)
      rank.set(x, 0)
    }
    let root = x
    while (parent.get(root) !== root) {
      root = parent.get(root)!
    }
    // Path compression
    let current = x
    while (current !== root) {
      const next = parent.get(current)!
      parent.set(current, root)
      current = next
    }
    return root
  }

  function union(a: string, b: string): void {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA === rootB) return

    const rankA = rank.get(rootA)!
    const rankB = rank.get(rootB)!
    if (rankA < rankB) {
      parent.set(rootA, rootB)
    } else if (rankA > rankB) {
      parent.set(rootB, rootA)
    } else {
      parent.set(rootB, rootA)
      rank.set(rootA, rankA + 1)
    }
  }

  // Initialize all items
  for (const item of items) {
    find(item.id)
  }

  // For each item, query the BK-tree for neighbors and union them
  for (const item of items) {
    const neighbors = tree.query(item.hash, threshold)
    for (const neighbor of neighbors) {
      if (neighbor.id !== item.id) {
        union(item.id, neighbor.id)
      }
    }
  }

  // Collect groups
  const groupMap = new Map<string, string[]>()
  for (const item of items) {
    const root = find(item.id)
    if (!groupMap.has(root)) {
      groupMap.set(root, [])
    }
    groupMap.get(root)!.push(item.id)
  }

  // Filter to groups with 2+ members
  return Array.from(groupMap.values()).filter((g) => g.length >= 2)
}
