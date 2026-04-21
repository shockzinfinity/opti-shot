import type { HashAlgorithm } from '../algorithm-registry'
import { sharpFromPath } from '../heic'
import { hammingDistance } from '../hash-utils'

/**
 * Compute dHash (Difference Hash) for an image.
 *
 * Algorithm:
 * 1. Resize to 9×8 greyscale
 * 2. Compare adjacent horizontal pixels: left < right → 1, else 0
 * 3. 8×8 = 64-bit hash → 16-char hex string
 */
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
      const left = data[y * WIDTH + x]
      const right = data[y * WIDTH + x + 1]
      binary += left < right ? '1' : '0'
    }
  }

  let hex = ''
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(binary.substring(i, i + 4), 2).toString(16)
  }

  return hex
}

export const dhashAlgorithm: HashAlgorithm = {
  id: 'dhash',
  name: 'dHash (Gradient)',
  description: '인접 픽셀 밝기 비교 — 빠르고 밝기/대비 변화에 강함',
  detailDescription: [
    'dHash (Difference Hash):',
    '이미지를 9×8 그레이스케일로 축소한 뒤 각 행에서 인접 픽셀 간 밝기 차이를 비교하여 64-bit 해시를 생성합니다.',
    'pHash보다 계산이 빠르고, 밝기/대비 조정에 덜 민감합니다.',
    '',
    '강점: 매우 빠른 계산, 밝기/대비 변화에 강함',
    '약점: 미세한 구조 차이에 둔감, 회전에 약함',
  ].join('\n'),
  version: '1.0.0',
  defaultThreshold: 10,

  computeHash: computeDhash,
  computeDistance: hammingDistance,
}
