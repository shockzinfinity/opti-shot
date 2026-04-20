# OptiShot 로드맵 현황

> 최종 갱신: 2026-04-20

## Phase 완료 현황

| Phase | 설명 | 상태 | Task |
|-------|------|------|------|
| P0 | 프로젝트 설정 | ✅ 완료 | 3/3 |
| P1 | 기초 인프라 (IPC, Shell, Settings) | ✅ 완료 | 3/3 |
| P2 | 스캔 파이프라인 (pHash+SSIM+BK-Tree) | ✅ 완료 | 7/7 |
| P3 | 검토 & 판정 (Group Review) | ✅ 완료 | 3/3 |
| P4 | 내보내기 & 휴지통 | ✅ 완료 | 4/4 |
| P5 | 설정 & 배포 | ✅ 완료 | 2/2 |

**핵심 기능 22/22개 Task 구현 완료.**

---

## 로드맵 외 추가 구현 항목

| 기능 | 상태 | 설명 |
|------|------|------|
| EXIF 사전 필터링 | ✅ | 촬영날짜/카메라/GPS/해상도 기반 사전 필터링 (32 concurrent) |
| Plugin Architecture | ✅ | DetectionPlugin 인터페이스 + PluginRegistry |
| HEIC/HEIF 변환 | ✅ | heic.ts 변환 + 캐싱 |
| 다국어 (i18n) | ✅ | ko/en/ja 3개 언어 |
| 윈도우 상태 저장 | ✅ | 위치/크기/최대화 복원 |
| 시스템 트레이 | ✅ | 최소화/종료 트레이 메뉴 |
| GitHub Actions CI/CD | ✅ | macOS/Windows/Linux 빌드 + 릴리스 |

---

## 이슈 사항 (즉시 대응)

| # | 항목 | 상태 | 설명 |
|---|------|------|------|
| 1 | GPS 필터 버그 | 🔧 수정 완료 | `exifr` GPSLatitude가 DMS 배열 반환 → `!= null` 체크로 수정, 앱 실행 확인 필요 |
| 2 | 트레이 메뉴 한국어 하드코딩 | ⚠️ | `src/main/index.ts`에 한국어 직접 입력, i18n 미적용 |
| 3 | DB 레거시 테이블 잔존 | ⚠️ | `review_decisions`, `scan_discoveries` — 스키마 제거됐으나 실제 DB에 남아있음 |
| 4 | Export 파일 실패 시 로깅 누락 | ⚠️ | 개별 파일 복사 실패 시 어떤 파일인지 기록 안 함 |

---

## 단기 (1~2주)

| # | 항목 | 분류 | 설명 |
|---|------|------|------|
| 1 | EXIF 필터링 E2E 검증 | 기능 | GPS/카메라/날짜/해상도 필터 전체 흐름 앱 실행 검증 |
| 2 | exifr 호출 최적화 | 성능 | `quality.ts`에서 `exifr.parse()` + `exifr.gps()` 2회 → 1회 통합 |
| 3 | 트레이 메뉴 i18n | UX | 시스템 트레이 문자열을 다국어 상수로 이동 |
| 4 | 키보드 단축키 안내 | UX | GroupReview 단축키 도움말 추가 |
| 5 | Export 에러 로깅 | 안정성 | 실패한 파일 경로 + 에러 메시지 기록 |

---

## 중기 (1~2개월)

| # | 항목 | 분류 | 설명 |
|---|------|------|------|
| 1 | Worker Threads 구현 | 성능 | `worker.ts`가 순차 실행 stub — UI의 parallelThreads(1~16) 미반영 |
| 2 | E2E 테스트 작성 | 품질 | Playwright 설정 존재, 테스트 파일 0개. 핵심 워크플로우 필요 |
| 3 | Correction Detection | 기능 | UI "준비 중" 표시. 구현하거나 완전 제거 |
| 4 | Incremental Scan | 기능 | 스캔 모드에 `incremental` 존재하나 미구현 |
| 5 | GPS 좌표 인덱스 | DB | `photos.latitude`/`longitude` 인덱스 추가 (지도 뷰 대비) |
| 6 | 컴포넌트 단위 테스트 | 품질 | AdvancedSettings, GroupList, TrashList 등 |

---

## 장기 (3개월+)

| # | 항목 | 분류 | 설명 |
|---|------|------|------|
| 1 | 지도 기반 위치 필터링 | 기능 | GPS 좌표 활용 반경 검색, 지도 시각화 (leaflet) |
| 2 | 메타데이터 통합 (F3) | 기능 | EXIF/XMP 메타데이터 편집 및 동기화 (PRD v2) |
| 3 | 동영상 지원 | 기능 | PRD Out of Scope, 향후 확장 가능 |
| 4 | 클라우드 백업 연동 | 기능 | 선택적 클라우드 동기화 검토 |
| 5 | 200K 이미지 벤치마크 | 성능 | Worker Threads 구현 후 대규모 검증 |
| 6 | Auto-updater 실전 배포 | 배포 | GitHub Releases 기반 자동 업데이트 채널 |

---

## 품질 현황 요약

| 영역 | 상태 | 비고 |
|------|------|------|
| 보안 | ✅ 양호 | contextIsolation, sandbox, Zod 검증 |
| 크로스 플랫폼 | ✅ 양호 | path 처리, titleBarStyle, 트래시 폴더 분기 |
| 테스트 | ⚠️ 부분 | 단위 17개(3,391줄), E2E 0개 |
| i18n | ✅ 완비 | ko/en/ja (트레이 메뉴 제외) |
| Worker Threads | ❌ stub | parallelThreads 설정 미반영 |
