// @TASK P2-R2 - Perceptual Hash (pHash) computation
// @SPEC CLAUDE.md#Architecture — Stage 1: pHash (DCT via sharp)

import { sharpFromPath } from './heic'

/**
 * 2D Discrete Cosine Transform.
 * Standard DCT-II formula applied to an NxN matrix.
 */
export function dct2d(matrix: number[][], N: number): number[][] {
  const result: number[][] = Array.from({ length: N }, () =>
    new Array(N).fill(0),
  )

  // Precompute cosine values for performance
  const cosTable: number[][] = Array.from({ length: N }, () =>
    new Array(N).fill(0),
  )
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

/**
 * Compute perceptual hash (pHash) for an image.
 *
 * Algorithm:
 * 1. Resize to 32x32 greyscale
 * 2. Apply 2D DCT
 * 3. Extract top-left 8x8 block (low frequencies)
 * 4. Calculate mean of 64 coefficients (excluding DC [0,0])
 * 5. Each coefficient > mean = 1, else 0 -> 64-bit binary -> hex
 *
 * @returns 16-character hex string (64-bit hash)
 */
export async function computePhash(imagePath: string): Promise<string> {
  const SIZE = 32
  const HASH_SIZE = 8

  // Step 1: Resize to 32x32 greyscale
  const sharpInstance = await sharpFromPath(imagePath)
  const { data } = await sharpInstance
    .resize(SIZE, SIZE, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })

  // Step 2: Build NxN matrix from raw pixel data
  const matrix: number[][] = Array.from({ length: SIZE }, (_, row) =>
    Array.from(
      { length: SIZE },
      (_, col) => data[row * SIZE + col],
    ),
  )

  // Step 3: Apply 2D DCT
  const dctMatrix = dct2d(matrix, SIZE)

  // Step 4: Extract top-left 8x8 block and compute mean (excluding DC)
  const coefficients: number[] = []
  for (let i = 0; i < HASH_SIZE; i++) {
    for (let j = 0; j < HASH_SIZE; j++) {
      if (i === 0 && j === 0) continue // Skip DC component
      coefficients.push(dctMatrix[i][j])
    }
  }

  const mean =
    coefficients.reduce((sum, val) => sum + val, 0) / coefficients.length

  // Step 5: Generate hash bits — include DC position as 0 in final hash
  let binary = ''
  for (let i = 0; i < HASH_SIZE; i++) {
    for (let j = 0; j < HASH_SIZE; j++) {
      if (i === 0 && j === 0) {
        // DC component always set to 0 (excluded from mean comparison)
        binary += '0'
      } else {
        binary += dctMatrix[i][j] > mean ? '1' : '0'
      }
    }
  }

  // Convert 64-bit binary to 16-character hex
  let hex = ''
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(binary.substring(i, i + 4), 2).toString(16)
  }

  return hex
}

// Re-export from shared utility for backward compatibility
export { hammingDistance } from './hash-utils'
