import type { VerifyAlgorithm } from '../algorithm-registry'
import { verifySsimGroup } from '../ssim'

export const ssimAlgorithm: VerifyAlgorithm = {
  id: 'ssim',
  name: 'SSIM',
  description: '구조적 유사도 — 인간 시각 기반 정밀 검증',
  detailDescription: [
    'SSIM (Structural Similarity Index):',
    '후보 그룹의 모든 이미지 쌍을 256×256으로 리사이즈한 뒤 8×8 슬라이딩 윈도우로 구조적 유사도를 계산합니다.',
    '인간의 시각 인지에 기반한 메트릭으로, 단순 픽셀 비교보다 정확하게 거짓 양성(False Positive)을 제거합니다.',
    '',
    '강점: 높은 정확도, 인간 시각과 일치',
    '약점: 계산 비용이 높음',
  ].join('\n'),
  version: '1.0.0',
  defaultThreshold: 0.82,

  verify: verifySsimGroup,
}
