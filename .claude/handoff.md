# OptiShot Session Handoff — 2026-04-20

## 이번 세션 완료 작업

### 보안 핸들러
- `will-navigate` + `setWindowOpenHandler` 추가 (`src/main/index.ts`)
- `ELECTRON_RENDERER_URL` 환경변수에서 동적 origin 추출 (매직 스트링 없음)
- 외부 링크는 OS 기본 브라우저로 열기, Electron 내부 새 창 거부

### 플러그인 아키텍처 (v0.2)

**새 파일 6개**:
- `src/shared/plugins.ts` — PluginInfo UI 타입
- `src/main/engine/plugin-registry.ts` — DetectionPlugin 인터페이스 + PluginRegistry 클래스
- `src/main/engine/plugins/phash-ssim.ts` — 내장 pHash+SSIM 플러그인
- `src/main/cqrs/handlers/plugin.ts` — plugin.list/plugin.toggle CQRS 핸들러

**수정 파일 16개**:
- `src/main/engine/bk-tree.ts` — `groupByDistance`에 `distanceFn` 파라미터 추가
- `src/main/engine/scan-engine.ts` — plugin 기반 리팩토링 (ScanEngineOptions.plugin 필수)
- `src/main/engine/index.ts` — 플러그인 관련 export 추가
- `src/main/services/scan.ts` — pluginRegistry에서 활성 플러그인 가져와 ScanEngine에 주입
- `src/main/services/settings.ts` — ScanSettings에 enabledPlugins 필드 추가
- `src/main/cqrs/index.ts` — 앱 시작 시 내장 플러그인 등록 + 설정 복원
- `src/main/cqrs/handlers/register.ts` — registerPluginHandlers 추가
- `src/main/cqrs/schemas.ts` — plugin.toggle Zod 스키마
- `src/shared/cqrs/commands.ts` — plugin.toggle 커맨드 (→ 22개)
- `src/shared/cqrs/queries.ts` — plugin.list 쿼리 (→ 17개)
- `src/shared/cqrs/bus.ts` — allowlist 업데이트
- `src/renderer/stores/settings.ts` — enabledPlugins 기본값 + 탭 타입 확장
- `src/renderer/pages/Settings.tsx` — Scan 탭 추가 (4탭 구성)
- `src/renderer/components/SettingsTabs.tsx` — 감지 알고리즘 카드 섹션 + 토글
- `src/renderer/i18n/ko.ts`, `en.ts`, `ja.ts` — 3개 i18n 키 추가

**테스트 수정 2개**:
- `tests/unit/engine/bk-tree.test.ts` — groupByDistance에 hammingDistance 전달
- `tests/unit/engine/scan-engine.test.ts` — plugin: phashSsimPlugin 전달

## 현재 상태
- **코드**: 201 테스트 통과, 0 TS 에러
- **CQRS**: CommandBus(22) / QueryBus(17) / EventBus(5)
- **플러그인**: phash-ssim 내장 (기본 활성)
- **Settings UI**: 스캔/UI/데이터/정보 4탭

## 다음 작업

### 배포 (보류 중)
1. ~~will-navigate 핸들러 추가 (보안)~~ ✓ 완료
2. GitHub Actions release.yml 작성
3. v0.1.0 태그 + Release (unsigned macOS DMG)

### 추가 플러그인 (v0.3)
1. dHash + MSE 플러그인 구현
2. 다중 플러그인 동시 실행 + 그룹 병합 로직
3. Stage 3 중복 감지 (ORB/딥러닝) 플러그인

## 미해결 이슈 (docs/ISSUES.md)
- DB 스키마 경량화 (scanDiscoveries, reviewDecisions 테이블)
- HEIC 성능 근본 해결 (네이티브 libheif 또는 디스크 캐시)
- 스캔 고급 옵션 미구현 6개
- 날짜별 사진 정리
- EXIF 편집
- Quick Start 가이드
