import type { VerifyAlgorithm } from '../algorithm-registry'
import { sharpFromPath } from '../heic'

const COMPARE_SIZE = 256

/**
 * Load image as greyscale raw buffer at COMPARE_SIZE × COMPARE_SIZE.
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
 * Compute Normalized MSE between two greyscale buffers.
 * NMSE = MSE / (255^2) → 0~1 range (0 = identical, 1 = maximally different)
 */
function computeNmse(buf1: Buffer, buf2: Buffer): number {
  let sum = 0
  for (let i = 0; i < buf1.length; i++) {
    const diff = buf1[i] - buf2[i]
    sum += diff * diff
  }
  const mse = sum / buf1.length
  return mse / (255 * 255)
}

/**
 * Verify a candidate group using NMSE with greedy clustering.
 * Same pattern as SSIM verification — precompute all pairs, then cluster.
 */
async function verifyNmseGroup(
  imagePaths: string[],
  threshold: number,
): Promise<string[][]> {
  if (imagePaths.length <= 1) {
    return [imagePaths]
  }

  // Load all buffers
  const buffers = new Map<string, Buffer>()
  for (const path of imagePaths) {
    buffers.set(path, await loadGreyscaleBuffer(path))
  }

  // Precompute all pairwise NMSE scores
  const scores = new Map<string, number>()
  const pairKey = (a: string, b: string): string =>
    a < b ? `${a}|${b}` : `${b}|${a}`

  for (let i = 0; i < imagePaths.length; i++) {
    for (let j = i + 1; j < imagePaths.length; j++) {
      const key = pairKey(imagePaths[i], imagePaths[j])
      const nmse = computeNmse(buffers.get(imagePaths[i])!, buffers.get(imagePaths[j])!)
      scores.set(key, nmse)
    }
  }

  // Greedy clustering: NMSE < threshold means similar
  const clusters: string[][] = []

  for (const path of imagePaths) {
    let added = false
    for (const cluster of clusters) {
      const allSimilar = cluster.every((member) => {
        const key = pairKey(path, member)
        const score = scores.get(key) ?? 1
        return score <= threshold
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

export const nmseAlgorithm: VerifyAlgorithm = {
  id: 'nmse',
  name: 'NMSE',
  description: '정규화 평균 제곱 오차 — 빠른 픽셀 수준 검증',
  detailDescription: [
    'NMSE (Normalized Mean Squared Error):',
    '후보 그룹의 이미지 쌍을 256×256 그레이스케일로 리사이즈한 뒤 픽셀 단위 제곱 오차의 평균을 계산합니다.',
    'MSE를 255²으로 나누어 0~1 범위로 정규화합니다 (0 = 동일, 1 = 완전 상이).',
    '',
    '강점: 계산이 빠르고 단순',
    '약점: 밝기/대비 변화에 민감 (같은 사진이라도 밝기가 다르면 높은 값)',
  ].join('\n'),
  version: '1.0.0',
  defaultThreshold: 0.05,

  verify: verifyNmseGroup,
}
