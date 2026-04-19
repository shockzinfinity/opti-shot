# OptiShot Session Handoff — 2026-04-19

## 이번 세션 완료 작업

### 이슈 해결 (4건)
1. **HEIC/HEIF 지원** — `sharpFromPath` 래퍼, `heic-convert` 연동, 변환 캐시(per-path JPEG buffer), 스캔 후 캐시 클리어
2. **리뷰 결정 영구 저장** — `photoGroups.decision` 기반 단순화 (reviewDecisions 테이블 의존 제거), `getPendingDeletions` = photoGroups.decision + photos.isMaster 조합
3. **스캔 에러 피드백** — `SkippedFile[]` 수집, ScanProgress에 `skippedCount`, UI 배너
4. **대시보드 스캔 이력** — `scans:list` 엔드포인트, ScanHistoryCard (이후 제거 — 최신 1건만 유지 구조)

### UX 플로우 정비
- 리뷰 상태 배지: 미검토 / 삭제 대기 / 휴지통 이동 완료 / 영구 삭제됨
- 사진 카드 배지: pending(주황) / trashed(빨강) / purged(회색+Ban아이콘)
- `keepAll` → 이전에 trashed된 사진 자동 복원 (`restoreGroupFromTrash`)
- purged 그룹: 모든 액션 버튼 disabled
- `executeDeletions` 후 `loadGroups()` 리로드
- GroupReview 페이지 진입 시 항상 fresh reload (selectedGroupId 리셋)

### 설정 정리
- 즉시 저장 방식으로 전환 (saveAll/cancel 버튼 제거)
- 스캔 탭 제거 → 폴더 선택 화면의 고급 설정으로 통합
- 미구현 옵션 3개 "준비 중" disabled 표시 (보정감지, EXIF필터링, 증분스캔)
- 시스템 휴지통 토글 추가 (`shell.trashItem`)
- 24시간제 토글 추가
- 캐시 지우기 버튼 제거 (스캔 이력 초기화에 포함)

### 리팩토링
- Dead code 제거: reviewDecisions 서비스 함수 4개 + IPC 3개 + 테스트 10개 (-580줄)
- 공통 유틸 추출: `formatDuration`, `formatDateLine`, `formatTimeLine`, `formatDateTime`, `formatDateCompact` → `shared/utils.ts`
- `StatusBadge` 공통 컴포넌트 추출
- `formatStorageSize` → `formatBytes`로 통일
- 미사용 i18n 키 5개 제거
- 매직 스트링 → 상수 객체 (`SCAN_STATUS`, `REVIEW_STATUS`, `DECISION`, `TRASH_STATUS`)
- 크로스플랫폼: titleBarStyle 분기, TRASH_FOLDER_NAME Windows 대응

### 기능 구현
- 창 크기 복원 (`window-bounds.json`)
- 트레이 최소화 (Tray API + close 이벤트 가로채기)
- 스캔 완료 알림 (Notification API, 포커스 없을 때만)
- 영구 삭제 시 썸네일 캐시 함께 삭제
- 대시보드 hero 문구 변경, 날짜/시간 2줄 분리

### Repository 구조 변경
- `opti-shot-dev` (private) — 개발 이력 보존
- `opti-shot` (public) — 클린 단일 커밋, 앞으로 모든 작업 여기서

## 현재 상태
- **코드**: 202 테스트 통과, 0 TS 에러 (기존 IPC 응답 타입 26개 제외)
- **Repository**: `origin` → `https://github.com/shockzinfinity/opti-shot.git` (public)
- **커밋**: `115deb5` (클린 초기 커밋) → 이후 수정 미커밋

## 다음 세션: 배포 마일스톤

### 배포 사전 점검 (계획 완료, 미실행)
계획 파일: `.claude/plans/sharded-finding-squid.md`

**즉시 수정:**
1. `electron-builder.yml` publish: `owner: shockzinfinity`, `repo: opti-shot`
2. `package.json` homepage/repository 필드 추가, `build` 블록 제거
3. copyright 연도 2025로 수정

**결정 필요:**
- macOS 코드사이닝: v0.1.0은 unsigned로, README에 보안 경고 안내 추가

**이후:**
- GitHub Actions 워크플로우 (`release.yml`) 작성
- 로컬 빌드 테스트 (`bun run build:mac`)
- 태그 push → Release 생성

## 미해결 이슈 (docs/ISSUES.md)
- DB 스키마 경량화 (scanDiscoveries, reviewDecisions 테이블)
- HEIC 성능 근본 해결 (네이티브 libheif 또는 디스크 캐시)
- 스캔 고급 옵션 미구현 6개
- Stage 3 중복 감지 (ORB/딥러닝)
- 날짜별 사진 정리
- EXIF 편집
- Quick Start 가이드
