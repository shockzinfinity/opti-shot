# OptiShot Session Handoff — 2026-04-20

## 이번 세션 완료 작업

### CQRS 아키텍처 전환 (핵심)
42개 개별 IPC 채널 → 3개 CQRS 버스로 전면 전환:

- **Phase 1**: CommandBus(21)/QueryBus(16)/EventBus(5) 인프라 구축
  - `src/shared/cqrs/` 타입 레지스트리 (CommandMap, QueryMap, EventMap)
  - `src/main/cqrs/` 버스 클래스 + IpcBridge (이중 검증: allowlist + Zod)
  - 11개 핸들러 모듈 (기존 서비스 래핑, try-catch는 Bridge에서 통합 처리)
- **Phase 2**: Renderer 전환
  - Preload: `command/query/subscribe` API 추가
  - 7 stores + 4 components → 레거시 `invoke/on` 완전 제거
  - `env.d.ts`: 제네릭 타입 (자동 완성 + 타입 추론)
- **Phase 3**: 정리 (-1,137줄)
  - `src/main/ipc/` 디렉토리 삭제 (14 파일)
  - `shared/types.ts`에서 IPC 상수 제거
  - Preload에서 레거시 invoke/on API 제거

### 배포 사전 점검 (부분)
- IpcResponse<T> 타입 정의 (TS 에러 34→0)
- electron-builder.yml publish owner/repo 수정
- package.json win 섹션 잘못된 속성 제거
- DMG 빌드 성공 확인 (129MB)

### 설계 검증
- Codex 2회 검증 → `docs/reports/cqrs-design-review-v2.md`
- Haiku 테스트 검증 (stores/components 전환 후 매 단계)
- 런타임 검증: `bun run dev` → main/renderer 에러 0건

## 현재 상태
- **코드**: 201 테스트 통과, 0 TS 에러
- **IPC**: CQRS 패턴 완전 전환 (레거시 코드 0줄)
- **커밋**: `c42d955` (CQRS merge on main)
- **빌드**: main 80KB, preload 2KB, renderer 878KB

## 다음 작업

### 배포 (즉시)
1. ~~will-navigate 핸들러 추가 (보안)~~ ✓ 완료 (2026-04-20)
2. GitHub Actions release.yml 작성
3. v0.1.0 태그 + Release (unsigned macOS DMG)

### 플러그인 아키텍처 (v0.2)
1. PluginRegistry + DetectionPlugin 인터페이스 구현
2. 기존 pHash+SSIM을 첫 번째 내장 플러그인으로 추출
3. 설정 UI에 알고리즘 on/off 섹션 추가

## 미해결 이슈 (docs/ISSUES.md)
- DB 스키마 경량화 (scanDiscoveries, reviewDecisions 테이블)
- HEIC 성능 근본 해결 (네이티브 libheif 또는 디스크 캐시)
- 스캔 고급 옵션 미구현 6개
- Stage 3 중복 감지 (ORB/딥러닝)
- 날짜별 사진 정리
- EXIF 편집
- Quick Start 가이드
