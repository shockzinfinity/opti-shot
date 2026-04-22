/**
 * Worker thread entry point for parallel hash computation.
 *
 * Receives {algoId, filePath} messages via parentPort,
 * computes the hash, and posts {filePath, hash} or {filePath, error} back.
 *
 * Each worker loads its own sharp/heic instances (no shared state).
 */

import { parentPort } from 'worker_threads'
import { sharpFromPath } from './heic'
import { hammingDistance as _hammingDistance } from './hash-utils'

// ─── Hash implementations (inlined to avoid circular deps with algorithm-registry) ───

const PHASH_SIZE = 32
const PHASH_HASH_SIZE = 8

function dct2d(matrix: number[][], N: number): number[][] {
  const result: number[][] = Array.from({ length: N }, () => new Array(N).fill(0))
  const cosTable: number[][] = Array.from({ length: N }, () => new Array(N).fill(0))
  for (let k = 0; k < N; k++) {
    for (let n = 0; n < N; n++) {
      cosTable[k][n] = Math.cos(((2 * n + 1) * k * Math.PI) / (2 * N))
    }
  }
  for (let u = 0; u < N; u++) {
    for (let v = 0; v < N; v++) {
      let sum = 0
      for (let x = 0; x < N; x++) {
        for (let y = 0; y < N; y++) {
          sum += matrix[x][y] * cosTable[u][x] * cosTable[v][y]
        }
      }
      const cu = u === 0 ? 1 / Math.sqrt(2) : 1
      const cv = v === 0 ? 1 / Math.sqrt(2) : 1
      result[u][v] = (2 / N) * cu * cv * sum
    }
  }
  return result
}

async function computePhash(imagePath: string): Promise<string> {
  const sharpInstance = await sharpFromPath(imagePath)
  const { data } = await sharpInstance
    .resize(PHASH_SIZE, PHASH_SIZE, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const matrix: number[][] = Array.from({ length: PHASH_SIZE }, (_, row) =>
    Array.from({ length: PHASH_SIZE }, (_, col) => data[row * PHASH_SIZE + col]),
  )
  const dctMatrix = dct2d(matrix, PHASH_SIZE)

  const coefficients: number[] = []
  for (let i = 0; i < PHASH_HASH_SIZE; i++) {
    for (let j = 0; j < PHASH_HASH_SIZE; j++) {
      if (i === 0 && j === 0) continue
      coefficients.push(dctMatrix[i][j])
    }
  }
  const mean = coefficients.reduce((sum, val) => sum + val, 0) / coefficients.length

  let binary = ''
  for (let i = 0; i < PHASH_HASH_SIZE; i++) {
    for (let j = 0; j < PHASH_HASH_SIZE; j++) {
      if (i === 0 && j === 0) { binary += '0'; continue }
      binary += dctMatrix[i][j] > mean ? '1' : '0'
    }
  }

  let hex = ''
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(binary.substring(i, i + 4), 2).toString(16)
  }
  return hex
}

async function computeDhash(imagePath: string): Promise<string> {
  const WIDTH = 9
  const HEIGHT = 8
  const sharpInstance = await sharpFromPath(imagePath)
  const { data } = await sharpInstance
    .resize(WIDTH, HEIGHT, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })

  let binary = ''
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH - 1; x++) {
      binary += data[y * WIDTH + x] < data[y * WIDTH + x + 1] ? '1' : '0'
    }
  }

  let hex = ''
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(binary.substring(i, i + 4), 2).toString(16)
  }
  return hex
}

// ─── Algorithm dispatch table ───

const HASH_FNS: Record<string, (path: string) => Promise<string>> = {
  phash: computePhash,
  dhash: computeDhash,
}

// ─── Message types ───

export interface HashRequest {
  algoId: string
  filePath: string
  requestId: number
}

export interface HashResponse {
  filePath: string
  hash?: string
  error?: string
  requestId: number
}

// ─── Worker message loop ───

if (parentPort) {
  parentPort.on('message', async (msg: HashRequest) => {
    const fn = HASH_FNS[msg.algoId]
    if (!fn) {
      parentPort!.postMessage({
        filePath: msg.filePath,
        error: `Unknown algorithm: ${msg.algoId}`,
        requestId: msg.requestId,
      } satisfies HashResponse)
      return
    }

    try {
      const hash = await fn(msg.filePath)
      parentPort!.postMessage({
        filePath: msg.filePath,
        hash,
        requestId: msg.requestId,
      } satisfies HashResponse)
    } catch (err) {
      parentPort!.postMessage({
        filePath: msg.filePath,
        error: err instanceof Error ? err.message : 'Unknown error',
        requestId: msg.requestId,
      } satisfies HashResponse)
    }
  })
}
