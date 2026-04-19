// @TASK P2-R2 - Structural Similarity Index (SSIM)
// @SPEC CLAUDE.md#Architecture — Stage 2: SSIM verification

import { sharpFromPath } from './heic'

// SSIM constants (based on the SSIM paper, Wang et al. 2004)
const K1 = 0.01
const K2 = 0.03
const L = 255 // Dynamic range for 8-bit images
const C1 = (K1 * L) ** 2 // (0.01 * 255)^2 = 6.5025
const C2 = (K2 * L) ** 2 // (0.03 * 255)^2 = 58.5225

const COMPARE_SIZE = 256
const WINDOW_SIZE = 8

/**
 * Compute SSIM between two images.
 * Both images are resized to 256x256 greyscale, then SSIM is computed
 * using a sliding window approach.
 *
 * @returns SSIM score between 0.0 and 1.0
 */
export async function computeSsim(
  imagePath1: string,
  imagePath2: string,
): Promise<number> {
  // Load both images as 256x256 greyscale raw buffers
  const [buf1, buf2] = await Promise.all([
    loadGreyscaleBuffer(imagePath1),
    loadGreyscaleBuffer(imagePath2),
  ])

  return computeSsimFromBuffers(buf1, buf2, COMPARE_SIZE, COMPARE_SIZE)
}

/**
 * Load image as greyscale raw buffer at COMPARE_SIZE x COMPARE_SIZE.
 */
async function loadGreyscaleBuffer(imagePath: string): Promise<Buffer> {
  const sharpInstance = await sharpFromPath(imagePath)
  const { data } = await sharpInstance
    .resize(COMPARE_SIZE, COMPARE_SIZE, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return data
}

/**
 * Compute SSIM from two raw greyscale buffers using sliding window.
 */
function computeSsimFromBuffers(
  buf1: Buffer,
  buf2: Buffer,
  width: number,
  height: number,
): number {
  let totalSsim = 0
  let windowCount = 0

  // Slide 8x8 window across the image
  for (let y = 0; y <= height - WINDOW_SIZE; y += WINDOW_SIZE) {
    for (let x = 0; x <= width - WINDOW_SIZE; x += WINDOW_SIZE) {
      const ssim = computeWindowSsim(buf1, buf2, x, y, width)
      totalSsim += ssim
      windowCount++
    }
  }

  return windowCount > 0 ? totalSsim / windowCount : 0
}

/**
 * Compute SSIM for a single window at position (wx, wy).
 *
 * SSIM(x,y) = (2*ux*uy + C1)(2*sxy + C2) / (ux^2 + uy^2 + C1)(sx^2 + sy^2 + C2)
 */
function computeWindowSsim(
  buf1: Buffer,
  buf2: Buffer,
  wx: number,
  wy: number,
  stride: number,
): number {
  const n = WINDOW_SIZE * WINDOW_SIZE

  let sum1 = 0
  let sum2 = 0
  let sumSq1 = 0
  let sumSq2 = 0
  let sumCross = 0

  for (let dy = 0; dy < WINDOW_SIZE; dy++) {
    for (let dx = 0; dx < WINDOW_SIZE; dx++) {
      const idx = (wy + dy) * stride + (wx + dx)
      const p1 = buf1[idx]
      const p2 = buf2[idx]

      sum1 += p1
      sum2 += p2
      sumSq1 += p1 * p1
      sumSq2 += p2 * p2
      sumCross += p1 * p2
    }
  }

  const mu1 = sum1 / n
  const mu2 = sum2 / n
  const sigma1Sq = sumSq1 / n - mu1 * mu1
  const sigma2Sq = sumSq2 / n - mu2 * mu2
  const sigma12 = sumCross / n - mu1 * mu2

  const numerator = (2 * mu1 * mu2 + C1) * (2 * sigma12 + C2)
  const denominator =
    (mu1 * mu1 + mu2 * mu2 + C1) * (sigma1Sq + sigma2Sq + C2)

  return numerator / denominator
}

/**
 * Verify a candidate group by computing pairwise SSIM.
 * Splits into sub-groups where all pairs exceed the threshold.
 *
 * Uses a greedy clustering approach:
 * - Start with first image as first cluster seed
 * - For each remaining image, try to add to existing cluster (all pairs pass threshold)
 * - If no cluster fits, create a new one
 */
export async function verifySsimGroup(
  imagePaths: string[],
  threshold: number,
): Promise<string[][]> {
  if (imagePaths.length <= 1) {
    return [imagePaths]
  }

  // Precompute all pairwise SSIM scores
  const scores = new Map<string, number>()
  const pairKey = (a: string, b: string): string =>
    a < b ? `${a}|${b}` : `${b}|${a}`

  const promises: Array<Promise<void>> = []
  for (let i = 0; i < imagePaths.length; i++) {
    for (let j = i + 1; j < imagePaths.length; j++) {
      const key = pairKey(imagePaths[i], imagePaths[j])
      promises.push(
        computeSsim(imagePaths[i], imagePaths[j]).then((score) => {
          scores.set(key, score)
        }),
      )
    }
  }
  await Promise.all(promises)

  // Greedy clustering
  const clusters: string[][] = []

  for (const path of imagePaths) {
    let added = false
    for (const cluster of clusters) {
      // Check if this path is similar to ALL existing members of the cluster
      const allSimilar = cluster.every((member) => {
        const key = pairKey(path, member)
        const score = scores.get(key) ?? 0
        return score >= threshold
      })

      if (allSimilar) {
        cluster.push(path)
        added = true
        break
      }
    }

    if (!added) {
      clusters.push([path])
    }
  }

  return clusters
}
