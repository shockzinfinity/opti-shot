# 02-features.md: Feature Specification

## MVP 캡슐 (요구사항 핵심 10줄)

> **목표**: 흩어진 추억을 안전하게 한 곳에 보존  
> **페르소나**: NAS+HDD+스마트폰에 20만+ 장 분산된 IT 개발자  
> **핵심 기능**: F1 중복감지(2-Stage), F2 베스탈 선별(AI추천+사용자확인), F4 내보내기(단순복사)  
> **North Star**: 중복 그룹 발견율 95%+ / 오탐율 5% 미만  
> **제약**: 20만 장 전체 스캔 30분 이내, 폴더별/기간별 선택 스캔, 증분 스캔  
> **위험**: 보정본 감지 정확도 (pHash 임계값)  
> **완화 전략**: Hamming Distance 임계값 A/B 테스트 (8 vs 10 vs 12)  
> **범위 외**: 메타데이터 통합(v2), 동영상(v2), 모바일(v2)  
> **Input Metric**: 스캔 완료율, 사용자 판정 완료율  
> **다음 단계**: `/screen-spec`으로 화면 명세 생성

---

## 1. F1: 유사/중복 감지·그룹화

### 1.1 개요

**목표**: pHash + Time-Window로 1차 후보 감지, ORB/SSIM으로 2차 정밀 검증. 중복 그룹화.

**범위**: MVP 핵심 (P0), 모든 이미지 포맷 지원

### 1.2 입출력 명세

#### 입력 (Input)

```
{
  "scan_mode": "full" | "folder" | "date_range" | "incremental",
  "target_folders": ["C:\\Photos", "\\\\NAS\\shared"],
  "date_range": {
    "start": "2024-01-01",  // Optional
    "end": "2024-12-31"     // Optional
  },
  "phash_threshold": 8,      // Hamming Distance 임계값 (기본 8)
  "ssim_threshold": 0.85,    // Structural Similarity 임계값
  "time_window_hours": 1,    // EXIF 기반 시각 범위 (기본 1시간)
  "batch_size": 100,         // 병렬 처리 배치 크기
  "num_threads": 8           // 병렬 스레드 수
}
```

#### 출력 (Output)

```
{
  "scan_id": "scan_20240415_143022",
  "status": "completed" | "in_progress" | "paused" | "failed",
  "scan_duration_seconds": 1800,
  "total_files_scanned": 200000,
  "total_groups": 5000,
  "groups": [
    {
      "group_id": "group_001",
      "size": 12,              // 그룹 내 파일 수
      "master_file": {
        "file_id": "file_001",
        "path": "C:\\Photos\\pic_20240415_120000.jpg",
        "file_size_kb": 2048,
        "phash": "a1b2c3d4e5f6...",
        "exif_datetime": "2024-04-15T12:00:00Z",
        "quality_score": 95
      },
      "variants": [
        {
          "file_id": "file_002",
          "path": "\\\\NAS\\shared\\pic_20240415_120015.jpg",
          "phash": "a1b2c3d4e5f7...",
          "hamming_distance": 3,      // From master
          "ssim_score": 0.98,         // 2차 검증 점수
          "is_edited": true,          // 보정본 마크
          "quality_score": 87,
          "timestamp_diff_sec": 15    // Master와의 시각 차이
        }
      ],
      "estimated_savings_kb": 20480  // 중복 제거 시 절약 용량
    }
  ],
  "summary": {
    "estimated_total_savings_kb": 51200000,  // 약 50GB
    "groups_with_edits": 200,
    "groups_without_exif": 50,
    "scan_errors": []
  }
}
```

### 1.3 알고리즘 상세

#### 1차 감지: pHash (Perceptual Hash)

**목적**: 콘텐츠 기반 빠른 유사도 판단

**알고리즘**
```typescript
1. 이미지 로드 (sharp)
2. 그레이스케일 변환
3. 32x32로 축소 (표준화)
4. DCT (Discrete Cosine Transform) 계산
5. 평균값으로 비트마스크 생성 (64비트)
```

**pHash 비교**: Hamming Distance 계산
- 거리 ≤ 임계값 → 후보 그룹
- 임계값 기본값: 8 (보수적)

**시간 필터 (Time-Window)**
- EXIF 촬영 시각이 있는 경우만 적용
- 범위: master와의 시각 차이 ≤ 1시간 (기본값)
- 목적: 서로 다른 날짜 사진의 오탐 감소 (예: 같은 장소 다른 날 촬영)

**BK-Tree 인덱싱**
```
1. 모든 pHash를 BK-Tree에 삽입 (Hamming Distance 메트릭)
2. 각 파일에 대해 BK-Tree 쿼리 (거리 ≤ 임계값)
3. 후보 목록 반환 (전체의 1% 이하로 필터링)
```

**성능 최적화**
- 배치 100개 이미지 단위로 처리
- 8개 스레드 병렬 계산
- pHash 계산만: 약 10ms/이미지 → 20만 장 약 33분

#### 2차 검증: ORB + SSIM (후보만)

**목적**: 1차 후보 중 거짓 양성 제거

**ORB (Oriented FAST and Rotated BRIEF)**
```
1. 특징점 추출 (키포인트 + 디스크립터)
2. Brute Force Matcher로 매칭
3. 매칭 포인트 수로 유사도 판단
```

**SSIM (Structural Similarity Index)**
```
1. 휘도(Luminance) 유사도
2. 대비(Contrast) 유사도
3. 구조(Structure) 유사도
4. 종합 점수: SSIM = (2*μx*μy + C1) * (2*σxy + C2) / ...
```

**판정 로직**
```
if (hamming_distance ≤ threshold AND SSIM ≥ 0.85) {
  "동일 또는 유사 이미지"
} else {
  "다른 이미지"
}
```

#### 보정본 감지

**특징**
- 파일명 패턴: 원본과 유사 (숫자/날짜만 다름)
- EXIF: 촬영 시각 동일 또는 매우 유사
- 메타데이터: XMP에 편집 정보 포함

**판정 로직**
```
if (phash_distance ≤ 3 AND ssim ≥ 0.95 AND 
    (exif_datetime_same OR time_diff ≤ 30sec) AND 
    (filename_similar OR xmp_edited)) {
  "is_edited = true"
}
```

### 1.4 엣지 케이스

| 케이스 | 처리 방법 |
|--------|----------|
| **EXIF 없는 사진** | Time-Window 사용 안 함, 콘텐츠 기반만 |
| **보정본+원본** | pHash 거리 작음 → 같은 그룹, is_edited=true 마크 |
| **파일명 무의미** | 파일명 의존 로직 없음, EXIF + 콘텐츠만 사용 |
| **동영상** | 확장자 필터로 제외 (.mp4, .mov 등) |
| **손상된 EXIF** | 콘텐츠 기반만, Time-Window 사용 안 함 |
| **같은 장소, 다른 시각** | Time-Window로 필터링 (오탐 방지) |
| **회전된 이미지** | EXIF Orientation으로 정규화 후 비교 |

### 1.5 성능 목표

| 항목 | 목표 |
|------|------|
| pHash 계산 | ≤ 10ms/이미지 |
| 2차 검증 (후보당) | ≤ 50ms |
| 20만 장 전체 스캔 | ≤ 30분 |
| 메모리 사용 | ≤ 4GB |
| BK-Tree 쿼리 | ≤ 1ms/쿼리 |

### 1.6 테스트 케이스

```
T1.1: 100장 테스트셋 (중복 20개, 보정본 10개)
      - 발견율 95%+ 
      - 오탐율 5% 미만

T1.2: 스캔 일시정지 & 재개
      - 스캔 상태 저장/복구
      - 중단점 이후부터 재개

T1.3: 폴더별 스캔
      - 특정 폴더만 스캔
      - 기존 결과와 병합 (증분 스캔)

T1.4: NAS 경로 스캔
      - SMB 공유 폴더 접근
      - 네트워크 지연 처리
```

---

## 2. F2: 품질 평가·베스탈 선별

### 2.1 개요

**목표**: 각 중복 그룹에서 최고 품질의 이미지(베스탈)를 AI가 추천하고 사용자가 확인/수정

**범위**: MVP (P1 - 우선도 높음)

### 2.2 품질 메트릭

#### Laplacian Variance (선명도)

```typescript
const gray = await sharp(imagePath).grayscale().toBuffer();
const laplacian = calculateLaplacian(gray);  // 0~1000+ (높을수록 선명)
const variance = computeVariance(laplacian);
const normalized = Math.min(variance / 500.0, 1.0) * 100;  // 0~100
```

**점수 해석**
- 0~20: 초점 흐림 (피하기)
- 20~50: 약간 흐림
- 50~80: 보통
- 80~100: 매우 선명

#### Brightness (노출)

```typescript
const { data } = await sharp(imagePath).raw().toBuffer({ resolveWithObject: true });
const avgBrightness = data.reduce((sum, val) => sum + val, 0) / data.length;  // 0~255
const brightness_score = Math.abs(avgBrightness - 128) / 128 * 100;  // 이상적: 128
```

**점수 해석**
- 128 근처: 100점 (적절한 노출)
- 0~50, 200~255: 20점 이하 (과다 또는 저노출)

#### Contrast (색감)

```typescript
const gray = await sharp(imagePath).grayscale().toBuffer();
const { mean, stdDev } = computeStdDev(gray);
const contrast_score = (stdDev / 128) * 100;  // 0~100
```

#### 종합 품질 점수

```
Quality Score = (
  Laplacian_Variance * 0.5 +      // 50% 가중치 (선명도 최우선)
  Brightness * 0.2 +               // 20% (노출)
  Contrast * 0.2 +                 // 20% (색감)
  EXIF_Complete * 0.1              // 10% (메타데이터)
) / 100 * 100

= 0~100 점 범위
```

### 2.3 베스탈 추천 로직

#### 그룹별 추천

```
1. 그룹 내 모든 파일에 대해 품질 점수 계산
2. 상위 3개 파일 순위 매기기
3. 상위 1개를 베스탈 1순위 추천 (is_bestel = true)
4. 상위 2~3개를 예비로 표시

추천 근거:
- "선명도 95점, 노출 양호, EXIF 완전"
- "원본 (보정본 아님)"
```

#### 사용자 오버라이드

```
사용자가 수동으로 베스탈 변경 가능:
- 마스터 파일 변경
- AI 추천 무시 & 직접 선택
- 조정 이유 기록 (선택사항)
```

### 2.4 입출력 명세

#### 입력

```json
{
  "group_id": "group_001",
  "files": [
    {
      "file_id": "file_001",
      "path": "C:\\Photos\\pic.jpg",
      "image_data": "binary"
    }
  ]
}
```

#### 출력

```json
{
  "group_id": "group_001",
  "files_with_scores": [
    {
      "file_id": "file_001",
      "quality_score": 95,
      "laplacian_variance": 480,
      "brightness_score": 98,
      "contrast_score": 85,
      "exif_complete": true,
      "is_edited": false,
      "recommendation_rank": 1,
      "recommendation_reason": "선명도 95점, 노출 양호, EXIF 완전"
    }
  ],
  "recommended_bestel": "file_001"
}
```

### 2.5 테스트 케이스

```
T2.1: 50장 테스트셋 (10개 그룹)
      - 품질 점수 정확도 검증
      - 베스탈 추천 수동 수정율 < 20%

T2.2: 극단적 케이스
      - 모두 낮은 품질 (점수 < 30점)
      - 모두 높은 품질 (점수 > 80점)
      - 극단적 노출 (암+밝음)
```

---

## 3. F4: 내보내기 (Export)

### 3.1 개요

**목표**: MVP는 선택한 베스탈을 지정 폴더로 복사/이동. v2에서 규칙 기반 자동화.

### 3.2 액션 명세

#### Copy (복사)

```
원본: C:\Photos\pic.jpg
대상: D:\Curated\pic.jpg
→ 원본 유지, 복사본 생성
```

#### Move (이동)

```
원본: C:\Photos\pic.jpg
대상: D:\Curated\pic.jpg
→ 원본 삭제 (휴지통으로 이동)
```

### 3.3 입출력 명세

#### 입력

```json
{
  "bestel_files": [
    {
      "file_id": "file_001",
      "src_path": "C:\\Photos\\pic_20240415.jpg",
      "group_id": "group_001"
    }
  ],
  "action": "copy" | "move",
  "dest_folder": "D:\\Curated Photos",
  "naming_rule": "original" | "group_based" | "date_based",
  "overwrite_policy": "skip" | "rename" | "overwrite"
}
```

#### 출력

```json
{
  "export_id": "export_20240415_143022",
  "status": "completed" | "partial" | "failed",
  "results": [
    {
      "file_id": "file_001",
      "src_path": "C:\\Photos\\pic_20240415.jpg",
      "dest_path": "D:\\Curated Photos\\pic_20240415.jpg",
      "status": "success",
      "file_size_kb": 2048,
      "checksum_src": "abc123...",
      "checksum_dest": "abc123...",
      "duration_seconds": 2
    }
  ],
  "summary": {
    "total_files": 100,
    "success_count": 100,
    "failed_count": 0,
    "total_size_kb": 204800,
    "total_duration_seconds": 180
  }
}
```

### 3.4 명명 규칙 (v1 MVP)

#### original (기본)

```
원본 파일명 유지
예: pic_20240415_120000.jpg
```

#### group_based (v2)

```
{group_id}/{filename}
예: group_001/pic_20240415_120000.jpg
```

#### date_based (v2)

```
{year}/{month}/{filename}
예: 2024/04/pic_20240415_120000.jpg
```

### 3.5 충돌 처리 (Overwrite Policy)

| 정책 | 동작 |
|------|------|
| **skip** | 파일 존재 시 건너뜀 (로그 기록) |
| **rename** | 파일명 변경 (예: pic_20240415 → pic_20240415_1.jpg) |
| **overwrite** | 덮어쓰기 (위험 - 경고 필수) |

### 3.6 안전 장치

**파일 무결성 검증**
```
1. 복사/이동 후 체크섬 비교 (SHA256)
2. 원본과 대상 파일 크기 일치 확인
3. 불일치 시 롤백 + 에러 기록
```

**롤백**
```
move 작업 중 오류 발생:
1. 부분 이동된 파일 원본 폴더로 복구
2. 대상 폴더의 이동 파일 삭제
3. 작업 로그 기록
```

### 3.7 테스트 케이스

```
T4.1: 100개 파일 Copy
      - 파일 무결성 100% 검증
      - 시간 성능: < 100ms/파일

T4.2: Move + 롤백
      - 중단 시나리오에서 부분 이동 복구
      - 작업 로그 정확성

T4.3: 충돌 처리
      - skip/rename/overwrite 정책 검증
```

---

## 4. F3: 메타데이터 통합/복원 (v2 Roadmap)

### 4.1 개요

**목표**: EXIF/XMP 메타데이터 읽기 및 복원

### 4.2 범위

- **읽기**: EXIF (촬영 시각, 카메라, GPS), XMP (편집 정보)
- **복원**: 손실된 메타데이터 추론
- **병합**: 원본+보정본 메타데이터 통합

### 4.3 출력

```json
{
  "file_id": "file_001",
  "exif": {
    "datetime_original": "2024-04-15T12:00:00Z",
    "camera_make": "Canon",
    "camera_model": "EOS R5",
    "lens": "RF 24-105mm",
    "focal_length_mm": 50,
    "aperture": "f/2.8",
    "shutter_speed": "1/1000",
    "iso": 200
  },
  "xmp": {
    "is_edited": true,
    "edit_software": "Lightroom",
    "keywords": ["landscape", "sunset"]
  }
}
```

---

## 5. 기능 로드맵

| 기능 | MVP | v1.1 | v2 |
|------|-----|------|-----|
| F1: 중복감지 | ✅ | - | 개선 |
| F2: 베스탈 선별 | ✅ | - | - |
| F4: 내보내기 (기본) | ✅ | - | - |
| F4: 내보내기 (규칙) | - | ✅ | - |
| F3: 메타데이터 | - | - | ✅ |
| 동영상 감지 | - | - | ✅ |
| 얼굴 인식 | - | - | ✅ |

