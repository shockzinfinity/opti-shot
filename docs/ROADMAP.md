# OptiShot 로드맵 현황

> 최종 갱신: 2026-04-21

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

## 완료된 추가 구현 항목

| 기능 | 설명 |
|------|------|
| EXIF 사전 필터링 | 촬영날짜/카메라/GPS/해상도 기반 사전 필터링 (32 concurrent) |
| Plugin Architecture | DetectionPlugin 인터페이스 + PluginRegistry + 플러그인별 UI 분리 |
| HEIC/HEIF 변환 | heic.ts 변환 + 캐싱 |
| 다국어 (i18n) | ko/en/ja 3개 언어 |
| 알림 시스템 | 3계층 (로그 파일 + EventBus + 인메모리) + CQRS 미들웨어 정책 기반 |
| 크래시 방어 | 글로벌 에러 핸들러 + 방어적 알림 + abort 조용히 처리 |
| Export 제거 | 앱 초점 명확화 (감지→비교→판정→삭제) |
| 다크 모드 테마 | Light/Dark/Auto + 시스템 테마 감지 (CSS 변수 오버라이드) |
| 파일 정리 | 촬영일 기반 일괄 리네임 + 되돌리기 + 이력 초기화 (설정) |
| DB 스키마 경량화 | 레거시 4테이블 제거, 현재 8테이블 |
| 플러그인별 임계값 UI | PluginSection 컴포넌트, 플러그인 없으면 미표시 |

---

## 해결된 이슈

| # | 항목 | 설명 |
|---|------|------|
| 1 | GPS 필터 버그 | exifr GPSLatitude DMS 배열 → `!= null` 체크 |
| 2 | 일시정지/취소 UX | 일시정지 제거, 취소 시 /folders 자동 이동 |
| 3 | EXIF 필터 위치 | 고급설정에서 분리 → 스캔 모드 아래 별도 섹션 |
| 4 | 고급설정 플러그인별 분리 | PluginSection, 플러그인 없으면 미표시 |
| 5 | 트레이 메뉴 i18n | TRAY_LABELS ko/en/ja |
| 6 | DB 레거시 테이블 정리 | 4개 테이블 DROP |

---

## 단기 — 사용자 가치 중심 (v0.2)

| # | 항목 | 분류 | 상태 |
|---|------|------|------|
| 1 | Auto-updater 실전 배포 | 배포 | 코드 구현됨, 실전 배포 미완 |
| 2 | Incremental Scan | 기능 | 스캔 모드에 존재하나 미구현, 설계 논의 필요 |
| 3 | dHash+MSE 플러그인 구현 | 플러그인 | 가이드 작성 완료, 구현 대기 |
| 4 | 다중 플러그인 동시 실행 + 그룹 병합 | 플러그인 | 기획 |
| 5 | Quick Start 가이드 / 온보딩 | UX | 아이디어 |

---

## 중기 — 내부 품질/성능 (v0.3)

| # | 항목 | 분류 | 상태 |
|---|------|------|------|
| 1 | Worker Threads (piscina) | 성능 | stub 상태, 4~8x 가속 예상 |
| 2 | Correction Detection 구현 또는 제거 | 정리 | DB 컬럼 잔재 |
| 3 | exifr 호출 최적화 | 성능 | parse() + gps() 2회 → 1회 통합 |
| 4 | 다중 회전 pHash 플러그인 | 플러그인 | 기획 |

---

## 장기 — 확장 기능 (v0.4+)

| # | 항목 | 분류 | 상태 |
|---|------|------|------|
| 1 | ORB 특징점 매칭 플러그인 (OpenCV) | 플러그인 | 기획 |
| 2 | 딥러닝 임베딩 플러그인 (ONNX Runtime) | 플러그인 | 기획 |
| 3 | 외부 플러그인 로더 (dynamic import) | 플러그인 | 기획 |
| 4 | 지도 기반 위치 필터링 | 기능 | GPS 데이터 있음 |
| 5 | EXIF 메타데이터 편집 | 기능 | 아이디어 |
| 6 | 동영상 지원 | 기능 | PRD Out of Scope |
| 7 | SSIM 고해상도 + GPU 가속 | 성능 | 512×512 이상 시 WebGPU 검토 |
| 8 | 대규모 스케일링 500K+ | 아키텍처 | BK-Tree→LSH, 스트리밍 배치 |

---

## CI/CD — 인프라

| # | 항목 | 상태 |
|---|------|------|
| 1 | GitHub Actions 워크플로우 | 미구현 |
| 2 | macOS/Windows/Linux 크로스 빌드 자동화 | 미구현 |
| 3 | 코드 서명 (Apple notarization, Windows signing) | 미구현 |

---

## 상시 — 개발 프로세스 (별도 과제가 아닌 당연한 개발 과정)

| 항목 | 원칙 |
|------|------|
| E2E 테스트 (Playwright) | 기능 구현 시 함께 작성 |
| 컴포넌트 단위 테스트 | 컴포넌트 수정 시 함께 작성 |
| 키보드 단축키 안내 | 사용자 요구 시 대응 |

---

## 품질 현황

| 영역 | 상태 | 비고 |
|------|------|------|
| 보안 | ✅ 양호 | contextIsolation, sandbox, Zod 검증 |
| 크로스 플랫폼 | ✅ 양호 | path 처리, titleBarStyle, 트래시 폴더 분기 |
| 다크 모드 | ✅ 완료 | Light/Dark/Auto + 시스템 감지 |
| 파일 정리 | ✅ 완료 | 일괄 리네임 + 되돌리기 + 이력 초기화 |
| 테스트 | ⚠️ 부분 | 단위 16파일 181개, E2E 0개 |
| i18n | ✅ 완비 | ko/en/ja |
| 알림 | ✅ 완료 | 정책 기반 미들웨어 + 3계층 |
| 크래시 방어 | ✅ 완료 | 글로벌 핸들러 + 방어적 코드 |
| Worker Threads | ❌ stub | parallelThreads 설정 미반영 |
| CI/CD | ❌ 미구현 | 워크플로우/서명 없음 |

---

## 기술 조사 기록 (구현 시 참고)

- **GPU 가속**: 현재 해상도(32×32 pHash, 256×256 SSIM)에서 불필요. SSIM 512×512 이상 시 검토. 상세: memory/project_gpu_analysis.md
- **exifr GPS**: GPSLatitude는 DMS 배열, latitude/longitude는 pick 불가. 상세: memory/project_exifr_gps.md
