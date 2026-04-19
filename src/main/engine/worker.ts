// @TASK P2-R2 - Worker thread entry point (STUB)
// @SPEC CLAUDE.md#Performance-Targets — Worker threads for parallel pHash

import { computePhash } from './phash'

// TODO: Move to worker_threads for true parallelism
// This is currently a sequential stub that will be parallelized
// in the optimization phase.

/**
 * Compute pHash for a batch of image paths.
 * Currently runs sequentially — will be moved to worker_threads
 * for true parallelism in a future optimization phase.
 *
 * @param paths - Array of absolute image file paths
 * @returns Map of path -> pHash hex string
 */
export async function computePhashBatch(
  paths: string[],
): Promise<Map<string, string>> {
  const results = new Map<string, string>()

  // TODO: Move to worker_threads for true parallelism
  for (const path of paths) {
    const hash = await computePhash(path)
    results.set(path, hash)
  }

  return results
}
