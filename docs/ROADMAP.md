# OptiShot 로드맵 현황

> 최종 갱신: 2026-04-20

## Phase 완료 현황

| Phase | 설명 | 상태 | Task |
|-------|------|------|------|
| P0 | 프로젝트 설정 | ✅ 완료 | 3/3 |
| P1 | 기초 인프라 (IPC, Shell, Settings) | ✅ 완료 | 3/3 |
| P2 | 스캔 파이프라인 (pHash+SSIM+BK-Tree) | ✅ 완료 | 7/7 |
| P3 | 검토 & 판정 (Group Review) | ✅ 완료 | 3/3 |
| P4 | 휴지통 (Export 제거됨) | ✅ 완료 | 2/4 |
| P5 | 설정 & 배포 | ✅ 완료 | 2/2 |

**핵심 기능 완료. Export 기능은 v0.3에서 제거 (OS 파일 관리로 대체).**

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
| 알림 시스템 | ✅ | 3계층 (로그 파일 + EventBus + 인메모리), 패널 닫기 시 읽음 처리 |
| Export 제거 | ✅ | OS 파일 관리로 대체, 앱 초점 명확화 (감지→비교→판정→삭제) |

---

## 이슈 사항 (즉시 대응)

| # | 항목 | 상태 | 설명 |
|---|------|------|------|
| 1 | GPS 필터 버그 | ✅ 수정 완료 | `exifr` GPSLatitude DMS 배열 → `!= null` 체크, 앱 동작 확인 완료 |
| 2 | 일시정지/취소 UX | ✅ 수정 완료 | 일시정지 제거(재개 불가), 취소 시 폴더 선택으로 자동 이동, 에러 방지 |
| 3 | EXIF 필터 위치 | ✅ 수정 완료 | 고급설정에서 분리 → 스캔 모드 아래 별도 섹션 |
| 4 | 고급설정 플러그인별 분리 | ✅ 수정 완료 | 활성 플러그인별 파라미터 섹션, 플러그인 없으면 미표시 |
| 5 | 트레이 메뉴 i18n | ✅ 수정 완료 | TRAY_LABELS로 ko/en/ja 지원 |
| 6 | DB 레거시 테이블 정리 | ✅ 수정 완료 | review_decisions, scan_discoveries, export_items, export_jobs DROP |
| 7 | ~~Export 로깅 누락~~ | ✅ 해소 | Export 기능 자체 제거됨 |
| 8 | 알림 시스템 구축 | ✅ 완료 | 3계층 아키텍처 + CQRS 미들웨어 + 정책 기반 자동 알림 |
| 9 | 크래시 방어 | ✅ 완료 | 글로벌 에러 핸들러 + 방어적 알림 발송 + abort 조용히 처리 |

---

## 단기 (1~2주)

| # | 항목 | 분류 | 설명 |
|---|------|------|------|
| 1 | exifr 호출 최적화 | 성능 | `quality.ts`에서 `exifr.parse()` + `exifr.gps()` 2회 → 1회 통합 |
| 2 | 키보드 단축키 안내 | UX | GroupReview 단축키 도움말 추가 |

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
| 7 | SSIM 고해상도 비교 + GPU 가속 | 성능 | SSIM 512×512 이상 시 WebGPU 컴퓨트 셰이더 검토. 현재 해상도(256×256)에서는 불필요 |
| 8 | 대규모 스케일링 (500K+) | 아키텍처 | BK-Tree→LSH 교체, 증분 스캔, 스트리밍 배치 처리 |

---

## 품질 현황 요약

| 영역 | 상태 | 비고 |
|------|------|------|
| 보안 | ✅ 양호 | contextIsolation, sandbox, Zod 검증 |
| 크로스 플랫폼 | ✅ 양호 | path 처리, titleBarStyle, 트래시 폴더 분기 |
| 테스트 | ⚠️ 부분 | 단위 17개(3,391줄), E2E 0개 |
| i18n | ✅ 완비 | ko/en/ja (트레이 메뉴 제외) |
| Worker Threads | ❌ stub | parallelThreads 설정 미반영 |
