# OptiShot Session Handoff — 2026-04-20

## 이번 세션 완료 작업

### 보안 핸들러
- `will-navigate` + `setWindowOpenHandler` 추가 (`src/main/index.ts`)
- `ELECTRON_RENDERER_URL` 환경변수에서 동적 origin 추출 (매직 스트링 없음)

### 플러그인 아키텍처 (v0.2)
- `DetectionPlugin` 인터페이스 + `PluginRegistry` + `phashSsimPlugin` 내장
- CQRS: `plugin.list` 쿼리, `plugin.toggle` 커맨드
- Settings > 스캔 탭: 알고리즘 on/off 토글 + `?` tooltip 상세 설명
- FolderSelect > 고급 설정: PresetSelector 추가 (Settings 기본값 연동)
- 가이드: `docs/plugin-development.md`, ISSUES.md에 7개 플러그인 후보 기록

### DB 스키마 경량화
- `scanDiscoveries`, `reviewDecisions` 테이블 제거 (10 → 8 테이블)
- Export 서비스: `reviewDecisions.isExportSelected` → `photos.isMaster + photoGroups.reviewStatus` 기반 전환
- FK 삭제 순서 수정: `trashItems → exportItems → exportJobs → photos → photoGroups`

### 리팩토링 (코드 품질)
- `shared/constants.ts` 생성 — SCAN_PRESETS, DEFAULT_*_SETTINGS, IMAGE_EXTENSIONS 단일 소스
- 프리셋 값 3중 중복 제거 (folder.ts, settings.ts, main/settings.ts → shared import)
- SSIM 기본값 불일치 수정 (DB 0.85 → 0.82 통일)
- PresetSelector: 하드코딩 details → SCAN_PRESETS에서 동적 생성
- ScanInfoPanel: 로컬 format 함수 제거 → shared/utils.ts 재사용
- MODE_LABELS 한글 하드코딩 → i18n 키 전환 (ko/en/ja)
- ScanRecord 타입 → shared/types.ts 이동
- SidePanel/PanelSection/PanelRow/PanelEmpty 공통 컴포넌트 추출
- ExifPanel + ScanInfoPanel → SidePanel 기반 리팩토링

### 배포
- GitHub Actions `release.yml` — macOS/Windows/Linux 매트릭스 빌드
- v0.1.0 + v0.1.1 릴리스 성공 (3개 플랫폼 전부 통과)

## 현재 상태
- **코드**: 200 테스트 통과, 0 TS 에러
- **CQRS**: CommandBus(22) / QueryBus(17) / EventBus(5)
- **DB**: 8 테이블 (scanDiscoveries, reviewDecisions 제거됨)
- **플러그인**: phash-ssim 내장 (기본 활성)
- **Settings UI**: 스캔/UI/데이터/정보 4탭
- **빌드**: main 83KB, preload 2KB, renderer 905KB
- **릴리스**: v0.1.1 (GitHub Actions, 3 플랫폼)

## 다음 작업

### 단기 (v0.2)
1. dHash + MSE 플러그인 구현 (가이드 준비됨)
2. 다중 플러그인 동시 실행 + 그룹 병합 로직
3. 플러그인별 임계값 슬라이더 분리

### 중기 (v0.3)
1. 스캔 고급 옵션 6개 구현 (증분 스캔, EXIF 필터 등)
2. HEIC 디스크 캐시 / 네이티브 libheif
3. Quick Start 가이드 + 프리셋/파라미터 메뉴얼
4. E2E 테스트 (Playwright) 설정

### 장기 (v0.4+)
1. ORB/딥러닝/OCR 플러그인
2. 외부 플러그인 로더
3. Apple 코드 서명 + 공증
4. 날짜별 사진 정리, EXIF 편집

## 미해결 이슈 (docs/ISSUES.md)
- HEIC 성능 근본 해결
- 스캔 고급 옵션 미구현 6개
- 감지 플러그인 후보 7개 (dhash, ahash, phash-rotated, color-histogram, orb, neural, ocr)
- Quick Start 가이드 (프리셋 영향도 설명 필수)
- 날짜별 사진 정리, EXIF 편집
