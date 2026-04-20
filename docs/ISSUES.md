# OptiShot 개선 이슈 목록

## 폴더별 휴지통 구조

**우선순위**: 높음  
**상태**: ✅ 구현 완료

### 현황
- 현재 통합 휴지통 (`~/AppData/OptiShot/trash/`)에 모든 파일 복사
- 외장 드라이브/NAS 사진을 내장 디스크로 복사하면 용량 낭비
- 같은 디스크 내 이동이면 순간 완료 + 추가 용량 소모 없음

### 구현 방안
- 원본 사진이 있는 폴더에 `.optishot-trash/` 숨김 디렉토리 생성
- 같은 디스크 내 `rename` (이동) → 복사 불필요, 즉시 완료
- DB에 trash 디렉토리 경로 기록 (복원 시 참조)
- 휴지통 화면에서 여러 폴더의 trash를 통합 조회

### 고려사항
- 크로스 디스크 이동 시 `rename` 실패 → fallback으로 copy + delete
- `.optishot-trash/`를 `.gitignore` 등에 추가 권장
- 권한 문제: 읽기 전용 디렉토리에는 trash 생성 불가 → 통합 휴지통으로 fallback

---

## 그룹별 리뷰 결정 이력 영구 저장 및 상태 복원

**우선순위**: 높음  
**상태**: ✅ 구현 완료

### 현황
- 리뷰 결정(유지/삭제)이 Zustand 메모리에만 존재 → 앱 종료/페이지 이동 시 소멸
- 다시 리뷰 화면에 들어가면 이전에 어떤 결정을 했는지 알 수 없음
- 이미 삭제한 그룹의 상태를 확인하거나 복원하는 UX 없음

### 필요한 동작
- 리뷰 화면 재진입 시 각 그룹의 상태를 명확히 표시:
  - `미검토` — 아직 판단하지 않음
  - `전체 유지` — 삭제 없음으로 결정
  - `중복 삭제 완료` — 어떤 사진이 삭제됐는지 표시, 복원 가능
- 이미 삭제된 그룹도 다시 검토 가능:
  - 복원 (trash에서 원본으로 되돌리기)
  - 대표 변경 후 다시 삭제
- 앱 종료 후 재시작해도 상태 유지

### 구현 방안

#### DB 스키마 변경
- `photo_groups`에 `decision` 컬럼 추가: `null` (미검토) / `kept_all` / `duplicates_deleted`
- `photo_groups`에 `decided_at` 타임스탬프 추가

#### 상태 복원 로직
- 리뷰 화면 진입 시:
  1. `photo_groups.decision`으로 그룹별 결정 유형 확인
  2. `trash_items`에서 해당 그룹의 삭제된 사진 조회
  3. 삭제된 사진의 `status` 확인 (`trashed` = 복원 가능, `purged` = 영구삭제됨)
- pending deletions를 DB 기반으로 재구성 (메모리 의존 제거)

#### UI 변경
- 사이드바 그룹 항목에 결정 상태 + trash 상태 표시:
  - `✓ 전체 유지`
  - `🗑 삭제됨 (2장, 복원 가능)`
  - `🗑 삭제됨 (영구삭제 완료)`
- 그룹 상세에서 삭제된 사진을 흐리게 표시 + "복원" 버튼

#### 고려사항
- pending deletions 메모리 저장 → DB 저장으로 전환 시 기존 로직 대폭 변경
- 실행 전/후 상태 구분이 명확해야 함 (아직 실행 안 한 "삭제 예정" vs 이미 실행한 "삭제 완료")
- 30일 후 영구삭제된 파일은 복원 불가 → UI에서 명확히 표시

---

## 대시보드 스캔 이력 및 작업 연속성

**우선순위**: 높음  
**상태**: ✅ 구현 완료

### 현황
- 대시보드의 "최근 스캔" 카드가 마지막 스캔 통계만 표시
- 미완료 리뷰(스캔 후 검토 미완료)를 이어갈 방법 없음
- 완료된 스캔 이력 조회 불가

### 구현 방안

#### 대시보드 "최근 스캔" 개선
- 스캔 이력 목록 표시 (날짜, 파일 수, 그룹 수, 상태)
- 상태별 분류:
  - `scanned` — 스캔 완료, 리뷰 미시작
  - `reviewing` — 리뷰 진행 중 (일부 그룹 검토)
  - `reviewed` — 모든 그룹 검토 완료, 실행 대기
  - `executed` — 삭제/유지 실행 완료
- 미완료 스캔 클릭 → 리뷰 화면으로 이동하여 이어서 검토
- 완료된 스캔 → 읽기 전용 이력 조회 (유지/삭제 결과)

#### 작업 연속성
- 앱 종료 후 재시작해도 미완료 리뷰를 이어갈 수 있어야 함
- pending deletions를 DB에 저장 (현재 메모리에만 보관)
- 리뷰 화면 진입 시 기존 pending deletions 복원

---

## 스캔 시 읽기 불가 파일 피드백

**우선순위**: 중간  
**상태**: ✅ 구현 완료

### 현황
- 파일 권한이 없거나(`----------`) 손상된 이미지는 `sharp`에서 에러 발생 시 조용히 건너뜀
- 사용자는 어떤 파일이 스캔에서 제외됐는지 알 수 없음

### 구현 방안
- 스캔 엔진에서 실패한 파일 경로 + 에러 원인을 수집
- 스캔 완료 후 "N개 파일을 읽을 수 없어서 건너뛰었습니다" 요약 표시
- 상세 목록을 펼쳐볼 수 있도록 UI 제공 (파일명 + 에러 유형: 권한 없음, 손상, 지원 안 되는 포맷 등)

---

## HEIC/HEIF 포맷 지원

**우선순위**: 높음  
**상태**: ✅ 구현 완료

### 현황
- `IMAGE_EXTENSIONS`에 `.heic`, `.heif` 미포함 — 스캔 대상에서 완전 제외
- sharp는 HEIC 메타데이터 읽기는 가능하나 픽셀 디코딩은 플랫폼별 `libheif` 의존
- iPhone 사진의 기본 포맷이 HEIC이므로 지원 필수

### 구현 방안
- `heic-convert` (pure JS) 라이브러리로 HEIC → JPEG 메모리 변환 후 처리
- `sharpFromPath()` 헬퍼 구현 완료 (`src/main/engine/heic.ts`)
- 남은 작업: `IMAGE_EXTENSIONS`에 `.heic`, `.heif` 추가 + 통합 테스트
- 크로스 플랫폼 호환: `heic-convert`는 pure JS라 macOS/Windows/Linux 모두 동작

### 검증 결과
```
IMG_1331.HEIC ↔ IMG_1332.HEIC
  sharp.metadata(): OK (4032x3024, heif)
  sharp.toBuffer(): FAIL (libheif 미설치 시)
  heic-convert → sharp: OK (JPEG 변환 후 정상 처리)
  pHash distance: 5 (MATCH)
  SSIM: 0.41 (NO MATCH — 각도 차이)
```

---

## 기하학적 변환에 강한 중복 감지 (Stage 3)

**우선순위**: 중간  
**상태**: 기획

### 현황
현재 2-Stage 파이프라인(pHash → SSIM)의 한계:
- **동일 피사체, 다른 각도/구도**로 촬영된 사진을 중복으로 감지하지 못함
- pHash는 전체 주파수 패턴 기반이라 각도 변화에 비교적 관대 (distance=5로 매칭)
- SSIM은 픽셀 위치 기반 비교라 카메라 이동/회전 시 급격히 하락 (0.41)
- threshold를 낮추면 false positive 폭증

### 실제 사례
```
IMG_1331.HEIC ↔ IMG_1332.HEIC (같은 피사체, 약간 다른 각도)
  pHash: distance=5  ✅ MATCH
  SSIM:  0.411        ❌ NO MATCH (threshold=0.82에 한참 못 미침)
```

### 개선 방안

#### Option A: 특징점 매칭 (Feature Matching)
- **SIFT/ORB/AKAZE** 알고리즘으로 이미지 내 특징점 추출
- 두 이미지 간 특징점 매칭 비율로 유사도 판단
- 기하학적 변환(회전, 크기 변경, 시점 변화)에 강함
- 구현: OpenCV.js 또는 opencv4nodejs 사용
- 단점: 의존성 크고 처리 속도 느림

#### Option B: 딥러닝 임베딩 (Neural Embedding)
- ResNet/EfficientNet 등으로 이미지 특징 벡터 추출
- 코사인 유사도로 비교
- 의미적 유사성(같은 장면, 다른 각도)에 강함
- 구현: ONNX Runtime 또는 TensorFlow.js
- 단점: 모델 크기(수십~수백MB), 초기 로딩 시간

#### Option C: pHash 단계에서 다중 해시
- 원본 + 회전(90/180/270) + 좌우반전된 이미지에 대해 pHash 계산
- 여러 해시 중 최소 distance 사용
- 간단하지만 회전/반전만 커버, 시점 변화는 부분적

### 권장
- 단기: Option C (낮은 비용으로 회전 커버)
- 중기: Option A (OpenCV ORB — 속도와 정확도 균형)
- 장기: Option B (딥러닝 기반 의미적 유사성)

### 파이프라인 확장 시 구조
```
Stage 1: pHash + BK-Tree  (빠른 선별)
Stage 2: SSIM             (구조적 유사성 검증)
Stage 3: ORB/Embedding    (기하학적 변환 대응) ← 추가
```

Stage 2에서 탈락한 후보 중 pHash distance가 낮은 쌍만 Stage 3으로 넘기면 성능 영향 최소화.

---

## 감지 플러그인 후보군

**우선순위**: 중간  
**상태**: 기획 (플러그인 인프라 구현 완료, 개별 구현 대기)  
**참조**: `docs/plugin-development.md` — 구현 가이드

### 현재 내장 플러그인
- **pHash + SSIM** (`phash-ssim`) — DCT 기반 지각 해시 + 구조적 유사도 검증. 기본 내장.

### 후보 1: dHash + MSE (`dhash-mse`)

**난이도**: 낮음 | **구현 가이드에 예제 코드 포함**

- Stage 1: Difference Hash — 인접 픽셀 밝기 차이로 64-bit 해시 생성
- Stage 2: Mean Squared Error — 픽셀 단위 오차 평균
- 특성: pHash보다 계산 빠름, 색상 보정 사진에 효과적, 회전 변형에 약함
- 용도: 대량 라이브러리 빠른 스캔, pHash 대안

### 후보 2: aHash (Average Hash) (`ahash`)

**난이도**: 낮음

- Stage 1: 이미지를 8×8 축소 → 전체 평균보다 밝은 픽셀 = 1 → 64-bit 해시
- Stage 2: 없음 (Stage 1만으로 충분할 수 있음)
- 특성: 가장 단순하고 빠름, 정확도는 낮음
- 용도: 빠른 사전 필터링, 정확한 복제본 감지

### 후보 3: 다중 회전 pHash (`phash-rotated`)

**난이도**: 중간

- Stage 1: 원본 + 90°/180°/270° 회전 + 좌우반전 → 각각 pHash 계산 → 최소 거리 채택
- Stage 2: SSIM (기존 재사용)
- 특성: 회전/반전된 사진 커버, 추가 비용 5배 (해시 5개 계산)
- 용도: 스마트폰 자동 회전 보정된 사진, 편집된 사진

### 후보 4: ORB 특징점 매칭 (`orb-bf`)

**난이도**: 높음 | **외부 의존성: OpenCV**

- Stage 1: ORB(Oriented FAST and Rotated BRIEF)로 특징점 추출 → 특징 벡터 해시화
- Stage 2: BFMatcher(Brute-Force Matcher)로 특징점 매칭 비율 계산
- 특성: 기하학적 변환(각도, 크기, 시점)에 강함, 느림
- 의존성: `opencv4nodejs` 또는 `@pdfjs/opencv-wasm`
- 용도: 같은 피사체 다른 각도 사진 감지 (기존 Stage 3 이슈 해결)

### 후보 5: 딥러닝 임베딩 (`neural-embedding`)

**난이도**: 높음 | **외부 의존성: ONNX Runtime**

- Stage 1: ResNet/EfficientNet으로 특징 벡터(1024-d) 추출 → 코사인 거리
- Stage 2: 없음 (임베딩 자체가 충분히 정확)
- 특성: 의미적 유사성 감지 (같은 장면, 다른 촬영 조건), 모델 크기 수십~수백MB
- 의존성: `onnxruntime-node` + 사전 학습 모델
- 용도: 의미적 중복 감지, 유사 장면 그룹화
- 주의: 앱 크기 증가 (모델 번들링), 초기 로딩 시간

### 후보 6: 색상 히스토그램 (`color-histogram`)

**난이도**: 낮음

- Stage 1: RGB/HSV 히스토그램 추출 → 히스토그램 해시 문자열 생성
- Stage 2: 히스토그램 교차(Intersection) 또는 상관(Correlation) 비교
- 특성: 색상 분포 기반이라 구도 변화에 강함, 색상이 유사한 다른 피사체에 약함
- 용도: 색 보정 전후 사진, 필터 적용 사진

### 후보 7: OCR 텍스트 비교 (`ocr-diff`)

**난이도**: 중간 | **외부 의존성: Tesseract.js**

- Stage 1: Tesseract.js로 이미지에서 텍스트 추출 → 텍스트 해시 생성
- Stage 2: 텍스트 유사도 비교 (Levenshtein distance 또는 cosine similarity)
- 특성: 동일 템플릿/다른 텍스트 내용의 스크린샷/문서를 정확히 구분
- 발견 계기: 같은 프레젠테이션의 다른 슬라이드 스크린샷이 pHash=6, SSIM=0.84로 중복 판정됨 (IMG_0033.PNG ↔ IMG_0035.PNG)
- 용도: 스크린샷, 문서 스캔, 프레젠테이션 슬라이드, UI 목업

### 우선순위 추천

| 순서 | 플러그인 | 이유 |
|------|---------|------|
| 1 | `dhash-mse` | 구현 가이드에 예제 있음, 바로 추가 가능 |
| 2 | `ahash` | 가장 단순, 빠른 사전 필터 용도 |
| 3 | `phash-rotated` | 기존 pHash/SSIM 재사용, 회전 문제 해결 |
| 4 | `color-histogram` | 순수 JS 구현 가능, 외부 의존 없음 |
| 5 | `ocr-diff` | 스크린샷/문서 중복 오탐 해결, Tesseract.js |
| 6 | `orb-bf` | OpenCV 의존, 기존 Stage 3 이슈 해결 |
| 7 | `neural-embedding` | 모델 번들링 필요, v1.0 이후 검토 |

---

## DB 스키마 경량화

**우선순위**: 낮음  
**상태**: 미구현

### 현황
- `scanDiscoveries` — 메모리에서만 처리, DB에서 읽히지 않음 → 삭제 가능
- `reviewDecisions` — 호출처 0곳 (getPendingDeletions가 photoGroups.decision + photos.isMaster로 대체됨) → 삭제 가능
- `scans` — 대시보드 메타데이터 표시용으로만 사용. 이력 누적 불필요 (photos/photoGroups는 최신 1건만 유지하므로). 1건만 유지하거나 key-value로 대체 가능

### 구현 방안
- `scanDiscoveries`, `reviewDecisions` 테이블 및 관련 서비스/IPC 코드 제거
- `scans` 테이블은 최신 1건만 유지하도록 단순화 (INSERT 전 기존 레코드 DELETE)
- 대시보드 RecentScanCard가 scans 테이블에 의존하므로 함께 조정

---

## 날짜별 사진 자동 정리 기능

**우선순위**: 낮음  
**상태**: 아이디어

### 개요
사진을 EXIF 촬영일(또는 파일 수정일) 기준으로 년/월/일 폴더 구조로 자동 분류하는 기능.
중복 제거와 별개로, 정리되지 않은 사진 라이브러리를 체계적으로 구조화하는 데 활용.

### 예시 구조
```
정리 대상 폴더/
├── 2024/
│   ├── 01/
│   │   ├── 15/  (또는 월 단위만)
│   │   │   ├── IMG_0001.jpg
│   │   │   └── IMG_0002.jpg
│   │   └── 28/
│   └── 12/
└── 2025/
    └── 04/
```

### 고려사항
- 분류 기준: EXIF DateTimeOriginal 우선, 없으면 파일 수정일 fallback
- 폴더 구조 depth: 년/월 또는 년/월/일 (사용자 선택)
- 동작 방식: 복사 또는 이동 (사용자 선택)
- 파일명 충돌 처리: skip / rename / overwrite
- 중복 제거 후 남은 사진만 대상으로 할지, 전체 사진 대상인지
- 기존 export 기능과 통합 가능성

---

## Quick Start 가이드 / 앱 사용 매뉴얼

**우선순위**: 중간  
**상태**: 아이디어

### 개요
타이틀 바의 `?` 버튼 클릭 시 현재 Settings/Info 탭으로 이동하지만, 앱 사용법을 안내하는 Quick Start 가이드를 보여주는 것이 더 유용함.

### 구현 방안
- `?` 버튼 → Quick Start 페이지(또는 모달)로 연결
- 단계별 워크플로우 안내: 폴더 선택 → 스캔 → 리뷰 → 삭제/유지 → 휴지통 관리
- 각 단계에 스크린샷 또는 일러스트
- 첫 실행 시 자동으로 표시 (onboarding), 이후에는 `?` 버튼으로 접근
- Settings/Info 탭은 별도 경로로 유지 (사이드바 설정 메뉴 등)

### 프리셋/파라미터 가이드 (필수 포함)
매뉴얼에 각 프리셋과 파라미터가 실제 감지 결과에 미치는 영향을 상세 설명해야 함:

- **프리셋 비교표**: conservative/balanced/sensitive 각각의 phashThreshold, ssimThreshold 값과 어떤 상황에 적합한지
- **pHash 임계값(4-16)**: 낮을수록 엄격 — 값별 감지 범위 예시 (4=정확한 복제본, 8=일반 중복, 12=유사 사진)
- **SSIM 임계값(0.5-0.95)**: 높을수록 엄격 — 값별 예시 (0.82=일반, 0.90=확실한 중복만)
- **오탐 사례와 대응**: 스크린샷/프레젠테이션 슬라이드 같은 "동일 레이아웃 + 다른 내용" 이미지가 balanced에서 중복 판정될 수 있음 → conservative로 해결
- **사진 종류별 권장 프리셋**: 일반 사진 촬영분=balanced, 스크린샷 포함 라이브러리=conservative, 대량 아카이브 정리=sensitive

---

## 스캔 고급 옵션 구현

**우선순위**: 중간  
**상태**: 미구현 (UI에 "준비 중" 표시됨)

### 미구현 항목
1. **보정 감지** (`enableCorrectionDetection`) — 회전/밝기 보정만 다른 중복 감지. Stage 3 (ORB/딥러닝)과 연계
2. **EXIF 날짜 필터링** (`enableExifFilter`) — 촬영일 기준으로 비교 대상 제한. 대량 라이브러리에서 성능 향상
3. **증분 스캔** (`enableIncremental`) — 이전 스캔 이후 추가된 파일만 스캔. photos 테이블에 스캔 이력 연동 필요
4. **스캔 모드** (`mode: date_range | folder_only | incremental`) — DB에 값만 저장, 실제 필터링 미구현
5. **시간 윈도우** (`timeWindowHours`) — DB에 값만 저장, 사용처 없음
6. **병렬 스레드** (`parallelThreads`) — DB에 값만 저장, worker_threads 미구현

### 현재 동작하는 옵션
- `phashThreshold` (pHash Hamming distance 역치)
- `ssimThreshold` (SSIM 유사도 역치)
- `batchSize` (배치당 처리 파일 수)

---

## HEIC 처리 성능 최적화

**우선순위**: 중간  
**상태**: 부분 개선 (변환 캐시 적용), 근본 해결 필요

### 현황
- `heic-convert` (pure JS) 변환이 파일당 수백ms~수초 소요
- 캐시 적용으로 같은 파일 재변환은 방지했으나, 첫 변환 자체가 느림
- HEIC 파일이 많을수록 스캔 시간 + 썸네일 로딩 시간 누적

### 근본적 개선 방안
1. **스캔 시 JPEG 변환본을 디스크에 캐시** — 메모리 캐시 대신 `cache/heic/<md5>.jpg`로 저장. 앱 재시작 후에도 재변환 불필요
2. **네이티브 libheif 사용** — `sharp`가 libheif 지원 빌드이면 `heic-convert` 없이 직접 디코딩 가능 (10x+ 빠름). 단, 크로스플랫폼 네이티브 빌드 복잡성 증가
3. **백그라운드 프리컨버전** — 폴더 등록 시 HEIC 파일을 미리 JPEG로 변환해두는 백그라운드 작업
4. **썸네일 우선 생성** — 스캔 완료 후 리뷰 화면 진입 전에 모든 썸네일을 미리 생성 (현재는 on-demand)

---

## EXIF 메타데이터 편집 기능

**우선순위**: 낮음  
**상태**: 아이디어

### 개요
사진의 EXIF 메타데이터를 직접 수정할 수 있는 기능. 특히 GPS 위경도 수정/삭제는 프라이버시 관점에서 실용적.

### 편집 대상 후보
- **GPS 위경도** — 수정, 삭제 (프라이버시 보호)
- **촬영 날짜/시간** — 카메라 시간 오류 보정, 날짜별 정리 전 수정
- **카메라/렌즈 정보** — 잘못 기록된 메타데이터 수정
- **방향(Orientation)** — 회전 보정

### 고려사항
- 원본 파일을 직접 수정하므로 Safety Rule("원본 파일 내용 변경 금지")과 충돌 → 별도 정책 필요 (백업 후 수정, 또는 사본에 적용)
- 라이브러리: `piexifjs` (pure JS, JPEG only) 또는 `exiftool` (네이티브, 거의 모든 포맷 지원)
- 배치 처리: 여러 사진의 GPS를 일괄 삭제하는 UX
- HEIC EXIF 수정은 `exiftool`이 필수 (pure JS 라이브러리는 HEIC 쓰기 미지원)
