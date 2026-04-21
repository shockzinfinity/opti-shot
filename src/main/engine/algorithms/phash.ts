import type { HashAlgorithm } from '../algorithm-registry'
import { computePhash } from '../phash'
import { hammingDistance } from '../hash-utils'

export const phashAlgorithm: HashAlgorithm = {
  id: 'phash',
  name: 'pHash (DCT)',
  description: 'DCT 기반 지각 해시 — 크기/압축 변화에 강함',
  detailDescription: [
    'pHash (Perceptual Hash):',
    '이미지를 32×32 그레이스케일로 축소한 뒤 DCT(이산 코사인 변환)를 적용하여 64-bit 해시를 생성합니다.',
    'BK-Tree 자료구조에서 해밍 거리(Hamming Distance)로 유사 이미지를 빠르게 그룹화합니다.',
    '',
    '강점: 리사이즈, 압축, 포맷 변환에 강함',
    '약점: 회전/반전에 약함',
  ].join('\n'),
  version: '1.0.0',
  defaultThreshold: 8,

  computeHash: computePhash,
  computeDistance: hammingDistance,
}
