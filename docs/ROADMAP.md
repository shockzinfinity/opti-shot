# OptiShot 로드맵 현황

> 최종 갱신: 2026-04-22 | 현재 버전: v0.3.x

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
| 알고리즘 아키텍처 | HashAlgorithm/VerifyAlgorithm 분리 + AlgorithmRegistry + 자유 조합 + 프리셋 |
| HEIC/HEIF 변환 | heic.ts 변환 + 캐싱 |
| 다국어 (i18n) | ko/en/ja 3개 언어 |
| 알림 시스템 | 3계층 (로그 파일 + EventBus + 인메모리) + CQRS 미들웨어 정책 기반 |
| 크래시 방어 | 글로벌 에러 핸들러 + 방어적 알림 + abort 조용히 처리 |
| Export 제거 | 앱 초점 명확화 (감지→비교→판정→삭제) |
| 다크 모드 테마 | Light/Dark/Auto + 시스템 테마 감지 (CSS 변수 오버라이드) |
| 파일 정리 | 촬영일 기반 일괄 리네임 + 되돌리기 + 이력 초기화 (설정) |
| DB 스키마 경량화 | 레거시 4테이블 제거, 현재 8테이블 |
| Auto-updater | GitHub API 직접 체크 + ~/Downloads로 다운로드 + Finder 위치 열기 (electron-updater 의존성 제거) |
| dHash + NMSE | Stage 1 dHash(Gradient) + Stage 2 NMSE(정규화 MSE) 알고리즘 |
| 그룹 병합 엔진 | Union-Find 기반 Union/Intersection 전략 + 복수 Stage 2 순차 파이프라인 |
| 프리셋 시스템 | 균형/빠른/보수적/정밀/사용자정의 — 점진적 공개 UI |

---

## 해결된 이슈

| # | 항목 | 설명 |
|---|------|------|
| 1 | GPS 필터 버그 | exifr GPSLatitude DMS 배열 → `!= null` 체크 |
| 2 | 일시정지/취소 UX | 일시정지 제거, 취소 시 /folders 자동 이동 |
| 3 | EXIF 필터 위치 | 고급설정에서 분리 → 스캔 모드 아래 별도 섹션 |
| 4 | 고급설정 알고리즘별 분리 | AlgorithmSection, 알고리즘 없으면 미표시 |
| 5 | 트레이 메뉴 i18n | TRAY_LABELS ko/en/ja |
| 6 | DB 레거시 테이블 정리 | 4개 테이블 DROP |

---

## 단기 — 사용자 가치 중심 (v0.2 ~ v0.3.x 완료)

| # | 항목 | 분류 | 상태 |
|---|------|------|------|
| 1 | ~~Auto-updater 실전 배포~~ | 배포 | ✅ 완료 — GitHub Releases 직접 다운로드 방식 (v0.3.2~) |
| 2 | ~~감지 알고리즘 아키텍처 재설계~~ | 아키텍처 | ✅ 완료 — 아래 상세 |
| 3 | Quick Start 가이드 / 온보딩 | UX | 아이디어 |

### #2 감지 알고리즘 아키텍처 재설계 ✅

상세 설계: `docs/planning/11-algorithm-architecture.md`

**2-Stage 파이프라인 (고정):**
- Stage 1 (후보 탐색): HashAlgorithm — pHash, dHash
- Stage 2 (정밀 검증): VerifyAlgorithm — SSIM, NMSE
- 복수 Stage 1 → Union-Find 병합 (Union/Intersection)
- 복수 Stage 2 → 순차 파이프라인

**프리셋:** 균형 / 빠른 / 보수적 / 정밀 / 사용자 정의

**구현 완료:**
- Step 1: 인터페이스 분리 + 마이그레이션 (`d92ab14`)
- Step 2: dHash + NMSE 추가 (`938a192`)
- Step 3: Union-Find 그룹 병합 (`6958e9e`)
- Step 4: UI + 프리셋 + 전체 연동 (`7a53840`)

---

## 중기 — 내부 품질/성능 (v0.3.x 완료)

| # | 항목 | 분류 | 상태 |
|---|------|------|------|
| 1 | ~~Worker Threads~~ | 성능 | ✅ 완료 — worker_threads 직접 구현 (hash-worker + HashWorkerPool, parallelThreads 설정 반영) |
| 2 | ~~Correction Detection 구현 또는 제거~~ | 정리 | ✅ 완료 — dead code 제거 (DB 컬럼만 호환 유지) |
| 3 | ~~exifr 호출 최적화~~ | 성능 | ✅ 완료 — parse(gps:true) 단일 호출로 통합 |
| 4 | ~~Auto-updater 재설계~~ | 배포 | ✅ 완료 — electron-updater 제거, GitHub Releases 직접 다운로드 |
| 5 | 다중 회전 해시 (HashAlgorithm) | 알고리즘 | 기획 — 0°/90°/180°/270° 회전 해시. 새 아키텍처 Stage 1 확장 |
| 6 | Incremental Scan | 기능 | 보류 — 아래 설계 메모 참고 |

---

## 장기 — 확장 기능 (v0.4+)

| # | 항목 | 분류 | 상태 |
|---|------|------|------|
| 1 | ORB 특징점 매칭 (VerifyAlgorithm) | 알고리즘 | 기획 — OpenCV 키포인트 비교. 새 아키텍처 Stage 2 확장 |
| 2 | 딥러닝 임베딩 (HashAlgorithm, ONNX) | 알고리즘 | 기획 — Gemma 4 E2B(2.3B, INT4 ~1-2GB) 또는 CLIP ViT-B/32(~350MB). 새 아키텍처 Stage 1 확장. 의미적 유사도(각도/보정/구도 차이) 감지 |
| 3 | 외부 알고리즘 로더 (dynamic import) | 아키텍처 | 기획 — AlgorithmRegistry에 외부 모듈 동적 등록 |
| 4 | 지도 기반 위치 필터링 | 기능 | GPS 데이터 있음 |
| 5 | EXIF 메타데이터 편집 | 기능 | 아이디어 |
| 6 | 동영상 지원 | 기능 | PRD Out of Scope |
| 7 | SSIM 고해상도 + GPU 가속 | 성능 | 512×512 이상 시 WebGPU 검토 |
| 8 | 대규모 스케일링 500K+ | 아키텍처 | BK-Tree→LSH, 스트리밍 배치 |

---

## CI/CD — 인프라

| # | 항목 | 상태 |
|---|------|------|
| 1 | GitHub Actions 워크플로우 | ✅ release.yml (태그 트리거, 3-OS 매트릭스, 캐싱, lint, 테스트) |
| 2 | macOS/Windows/Linux 크로스 빌드 자동화 | ✅ electron-builder 3-OS 타겟 |
| 3 | 코드 서명 (Apple notarization, Windows signing) | 미구현 — 자동 설치 불가, 현재는 ~/Downloads로 다운로드 후 수동 설치 안내 |

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
| 테스트 | ⚠️ 부분 | 단위 18파일 190개, E2E 0개 |
| i18n | ✅ 완비 | ko/en/ja |
| 알림 | ✅ 완료 | 정책 기반 미들웨어 + 3계층 |
| 크래시 방어 | ✅ 완료 | 글로벌 핸들러 + 방어적 코드 |
| Worker Threads | ✅ 완료 | HashWorkerPool, parallelThreads 설정 반영 |
| CI/CD | ⚠️ 부분 | release.yml 완료, 코드 서명 미구현 |

---

## 기술 조사 기록 (구현 시 참고)

- **GPU 가속**: 현재 해상도(32×32 pHash, 256×256 SSIM)에서 불필요. SSIM 512×512 이상 시 검토. 상세: memory/project_gpu_analysis.md
- **exifr GPS**: GPSLatitude는 DMS 배열, latitude/longitude는 pick 불가. 상세: memory/project_exifr_gps.md
- **로컬 LLM 이미지 유사도 플러그인 후보**:
  - Gemma 4 E2B (2.3B effective, INT4 ~1-2GB) — 네이티브 멀티모달, ONNX 공식 지원, 의미적 유사도 감지 가능
  - CLIP ViT-B/32 (~350MB) — 임베딩 전용, 코사인 유사도 직접 비교, 가장 빠름
  - SuperGemma4 26B — **텍스트 전용** (비전 없음), 코드/추론/한국어 특화 파인튠. 코딩 에이전트용으로 추후 테스트 예정
    - HF: https://huggingface.co/Jiunsong/supergemma4-26b-uncensored-mlx-4bit-v2
    - MLX 4-bit, ~13GB, Apple Silicon 최적화, 46.2 tok/s
- **Incremental Scan (보류)**:
  - 사진 정리 앱은 상시 가동 도구가 아님 — 필요할 때 한 번 돌리는 패턴
  - 대부분의 사용자는 한 번 정리 후 당분간 미사용, 재사용 시 폴더 구성이 달라져 있을 가능성 높음
  - 구현 시 방향: `scanned_files` 테이블 (path+size+mtime 복합키)로 기존 pHash 재사용, 그룹은 매번 재생성 (병합보다 단순)
  - 병목은 pHash 계산이므로, 기존 파일 pHash를 DB에서 로드하면 신규 파일만 계산 → 효과 큼
  - 실제 사용자 피드백이 오거나 Worker Threads 이후 재검토
