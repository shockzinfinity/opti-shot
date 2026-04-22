/**
 * HashWorkerPool: Worker thread pool for parallel hash computation.
 *
 * Creates N worker threads, dispatches hash requests round-robin,
 * collects results via Promise resolution. Supports graceful shutdown
 * and abort signal propagation.
 */

import { Worker } from 'worker_threads'
import { join } from 'path'
import type { HashRequest, HashResponse } from './hash-worker'

/** Pending request tracked by requestId */
interface PendingRequest {
  resolve: (resp: HashResponse) => void
  reject: (err: Error) => void
}

export class HashWorkerPool {
  private workers: Worker[] = []
  private pending = new Map<number, PendingRequest>()
  private nextRequestId = 0
  private nextWorkerIdx = 0
  private terminated = false

  /**
   * Create a worker pool.
   * @param numWorkers - Number of worker threads to spawn
   */
  constructor(numWorkers: number) {
    const workerPath = this.resolveWorkerPath()
    for (let i = 0; i < numWorkers; i++) {
      const worker = new Worker(workerPath)
      worker.on('message', (msg: HashResponse) => {
        const req = this.pending.get(msg.requestId)
        if (req) {
          this.pending.delete(msg.requestId)
          req.resolve(msg)
        }
      })
      worker.on('error', (err: Error) => {
        console.error('[HashWorkerPool] Worker error:', err.message)
      })
      this.workers.push(worker)
    }
  }

  /**
   * Resolve the worker script path.
   * In dev: TypeScript file via electron-vite's transform.
   * In prod: compiled JS in out/main/.
   */
  private resolveWorkerPath(): string {
    // __dirname points to out/main/ in production, src/main/engine/ in dev
    // electron-vite compiles main process files to out/main/
    return join(__dirname, 'hash-worker.js')
  }

  /**
   * Compute a hash for a single file using a worker thread.
   * Returns the hash string or throws on error.
   */
  async computeHash(algoId: string, filePath: string): Promise<string> {
    if (this.terminated) {
      throw new Error('Worker pool has been terminated')
    }

    const requestId = this.nextRequestId++
    const workerIdx = this.nextWorkerIdx % this.workers.length
    this.nextWorkerIdx++

    const worker = this.workers[workerIdx]

    return new Promise<string>((resolve, reject) => {
      this.pending.set(requestId, {
        resolve: (resp: HashResponse) => {
          if (resp.error) {
            reject(new Error(resp.error))
          } else {
            resolve(resp.hash!)
          }
        },
        reject,
      })

      worker.postMessage({
        algoId,
        filePath,
        requestId,
      } satisfies HashRequest)
    })
  }

  /**
   * Compute hashes for a batch of files in parallel across workers.
   * Returns a Map<filePath, hash>. Files that fail are collected in errors.
   *
   * @param algoId - Algorithm ID ('phash' or 'dhash')
   * @param filePaths - Files to hash
   * @param signal - Optional AbortSignal
   * @returns { hashes, errors }
   */
  async computeBatch(
    algoId: string,
    filePaths: string[],
    signal?: AbortSignal,
  ): Promise<{ hashes: Map<string, string>; errors: Map<string, string> }> {
    const hashes = new Map<string, string>()
    const errors = new Map<string, string>()

    if (filePaths.length === 0) return { hashes, errors }

    // Dispatch all at once, let workers process round-robin
    const promises = filePaths.map(async (filePath) => {
      if (signal?.aborted) return
      try {
        const hash = await this.computeHash(algoId, filePath)
        hashes.set(filePath, hash)
      } catch (err) {
        errors.set(filePath, err instanceof Error ? err.message : 'Unknown error')
      }
    })

    // If aborted, reject pending
    if (signal) {
      const onAbort = () => {
        for (const [id, req] of this.pending) {
          req.reject(new Error('Scan aborted'))
          this.pending.delete(id)
        }
      }
      signal.addEventListener('abort', onAbort, { once: true })
      try {
        await Promise.all(promises)
      } finally {
        signal.removeEventListener('abort', onAbort)
      }
    } else {
      await Promise.all(promises)
    }

    return { hashes, errors }
  }

  /**
   * Terminate all workers. Call after scan completes.
   */
  async terminate(): Promise<void> {
    this.terminated = true
    // Reject all pending
    for (const [id, req] of this.pending) {
      req.reject(new Error('Worker pool terminated'))
    }
    this.pending.clear()

    await Promise.all(this.workers.map((w) => w.terminate()))
    this.workers = []
  }

  /** Number of active workers. */
  get size(): number {
    return this.workers.length
  }
}
