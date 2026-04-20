import type { DetectionPlugin } from '../plugin-registry'
import { computePhash, hammingDistance } from '../phash'
import { verifySsimGroup } from '../ssim'

/** Built-in pHash + SSIM detection plugin. */
export const phashSsimPlugin: DetectionPlugin = {
  id: 'phash-ssim',
  name: 'pHash + SSIM',
  description: 'DCT 기반 지각 해시(Stage 1) + 구조적 유사도(Stage 2) 검증',
  detailDescription: [
    'Stage 1 — pHash (Perceptual Hash):',
    '이미지를 32×32 그레이스케일로 축소한 뒤 DCT(이산 코사인 변환)를 적용하여 64-bit 해시를 생성합니다.',
    'BK-Tree 자료구조에서 해밍 거리(Hamming Distance)로 유사 이미지를 빠르게 그룹화합니다.',
    '',
    'Stage 2 — SSIM (Structural Similarity):',
    '후보 그룹의 모든 이미지 쌍을 256×256으로 리사이즈한 뒤 8×8 슬라이딩 윈도우로 구조적 유사도를 계산합니다.',
    '인간의 시각 인지에 기반한 메트릭으로, 단순 픽셀 비교보다 정확하게 거짓 양성(False Positive)을 제거합니다.',
  ].join('\n'),
  version: '1.0.0',
  builtIn: true,
  defaultHashThreshold: 8,
  defaultVerifyThreshold: 0.82,

  computeHash: computePhash,
  computeDistance: hammingDistance,
  verify: verifySsimGroup,
}
