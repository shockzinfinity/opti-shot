# OptiShot 검증 가이드

## 1. 즉시 실행 가능한 검증 명령어

```bash
# 전체 테스트 (212개, ~1초)
npx vitest run

# TypeScript 타입 검사
npx tsc --noEmit

# 프로덕션 빌드 (Main + Preload + Renderer)
npx electron-vite build

# 커버리지 리포트
npx vitest run --coverage

# 앱 실행 (개발 모드)
npm run dev
```

---

## 2. 검증 체계 (4-Layer)

### Layer 1: 자동 검증
| 명령어 | 검증 대상 | 통과 기준 |
|--------|----------|----------|
| `npx vitest run` | 유닛 + 통합 테스트 | 212/212 pass |
| `npx tsc --noEmit` | 타입 안전성 | 0 errors |
| `npx electron-vite build` | 번들링 (3 targets) | Main + Preload + Renderer 성공 |

### Layer 2: 외부 AI 크로스 검증 (cmux 병렬)
```bash
# Codex — 기획 의도 vs 구현 대조
cmux new-pane --direction right
cmux send --surface surface:N "codex --sandbox danger-full-access --ask-for-approval never '기획 검증 프롬프트'"

# Gemini — 디자인 가이드라인 준수
cmux new-pane --direction down --pane pane:N
cmux send --surface surface:M "gemini --sandbox --approval-mode auto_edit -p '디자인 검증 프롬프트'"
```

### Layer 3: /quality full 스킬 (5단계 체인)
```
1. Check        — 테스트 + 타입 + 빌드
2. Evaluation   — 커버리지, 복잡도 메트릭
3. Code Review  — Spec Compliance + Code Quality (code-reviewer-pro 에이전트)
4. Security     — OWASP + 시크릿 + 의존성 (security-specialist 에이전트)
5. Frontend     — React 패턴 + 성능 + 접근성 (frontend-developer 에이전트)
```

### Layer 4: 수동 비주얼 QA
```bash
npm run dev
# 각 화면 접속하여 Stitch 목업과 비교
# 라우트: /, /folders, /scan, /review, /export, /trash, /settings
```

---

## 3. 핵심 검증 포인트

### A. 안전성 (Safety Rules — 절대 위반 불가)

| 규칙 | 검증 방법 | 관련 파일 |
|------|----------|----------|
| 원본 파일 수정 금지 | `grep -rn "unlinkSync\|rmSync\|renameSync" src/main/services/` — trash.ts의 trash 디렉터리 내 삭제만 허용 | `trash.ts`, `export.ts` |
| Soft Delete Only (30일) | trash.test.ts: "does NOT delete original" 테스트 존재 확인 | `tests/unit/services/trash.test.ts` |
| 100% 로컬 | `grep -rn "fetch\|axios\|http\|https" src/` — `electron-updater`만 허용 | 전체 |
| contextIsolation=true | `src/main/index.ts` 확인 | `index.ts` |

### B. 보안 (Electron Security)

| 항목 | 검증 방법 | 관련 파일 |
|------|----------|----------|
| IPC 채널 화이트리스트 | `src/preload/index.ts`에서 `ALLOWED_INVOKE` Set 확인 | `preload/index.ts` |
| CSP 설정 | `src/renderer/index.html`에 `Content-Security-Policy` meta 태그 확인 | `index.html` |
| sandbox 활성화 | `src/main/index.ts`에서 `sandbox: true` 확인 | `index.ts` |
| IPC 입력 검증 | `src/main/ipc/validators.ts`에 Zod 스키마, 각 handler에서 `.parse()` 호출 확인 | `validators.ts`, `handlers/*.ts` |
| nodeIntegration=false | `src/main/index.ts` webPreferences 확인 | `index.ts` |

### C. 핵심 알고리즘 (Scan Engine)

| 항목 | 검증 방법 | 관련 파일 |
|------|----------|----------|
| pHash (DCT) | `tests/unit/engine/phash.test.ts` — 11 tests (해밍 거리, 16자 hex) | `engine/phash.ts` |
| BK-Tree 그룹화 | `tests/unit/engine/bk-tree.test.ts` — 13 tests (union-find, threshold 쿼리) | `engine/bk-tree.ts` |
| SSIM 검증 | `tests/unit/engine/ssim.test.ts` — 8 tests (동일=1.0, 다름<0.5) | `engine/ssim.ts` |
| 품질 점수 | `tests/unit/engine/quality.test.ts` — 7 tests (선명>흐림, 0-100 범위) | `engine/quality.ts` |
| 파이프라인 통합 | `tests/unit/engine/scan-engine.test.ts` — 8 tests (그룹 감지, 마스터 선정, AbortSignal) | `engine/scan-engine.ts` |
| 에러 복원력 | scan-engine.ts에 per-file try/catch — 손상 파일 스킵 | `scan-engine.ts:114-123` |

### D. 디자인 시스템 준수

| 규칙 | 검증 방법 |
|------|----------|
| 컬러 토큰만 사용 | `grep -rn "green-\|red-\|blue-\|yellow-" src/renderer/` → 0 결과 |
| rounded-xl 통일 | `grep -rn "rounded-2xl\|rounded-md" src/renderer/` → 0 결과 (아이콘 래퍼의 rounded-lg은 허용) |
| lucide-react만 사용 | `grep -rn "material-symbols\|@mui\|heroicons" src/renderer/` → 0 결과 |
| font-heading/body/mono | 각 페이지에서 제목=font-heading, 데이터=font-mono 확인 |

### E. 프론트엔드 품질

| 항목 | 검증 방법 | 관련 파일 |
|------|----------|----------|
| Virtual List | `grep -rn "FixedSizeList" src/renderer/` — TrashList, DiscoveryFeed, GroupList | `components/*.tsx` |
| Thumbnail 캐싱 | `src/renderer/hooks/useThumbnail.ts` — Map 기반 인메모리 캐시 | `hooks/useThumbnail.ts` |
| Modal 포커스 트랩 | `src/renderer/hooks/useFocusTrap.ts` — Tab 순환 + Escape 닫기 | `hooks/useFocusTrap.ts` |
| ARIA 속성 | `grep -rn "aria-label\|role=\"switch\"\|role=\"dialog\"" src/renderer/` | 전체 컴포넌트 |
| 유틸리티 중복 제거 | `grep -rn "function formatBytes" src/` — `@shared/utils.ts`에만 1개 | `shared/utils.ts` |
| IPC 상수 사용 | `grep -rn "IPC\." src/renderer/stores/` — 모든 스토어에서 상수 사용 | `stores/*.ts` |

---

## 4. 커버리지 맵

```
Engine (97%)     ████████████████████░  — 핵심 알고리즘, 높은 커버리지
Services (91%)   ██████████████████░░░  — 비즈니스 로직, 양호
IPC Handlers     ██░░░░░░░░░░░░░░░░░░  — Electron 런타임 필요 (E2E 커버)
Renderer         ░░░░░░░░░░░░░░░░░░░░  — 컴포넌트 테스트 미작성 (수동 QA)
```

---

## 5. 알려진 제한사항

| 항목 | 상태 | 비고 |
|------|------|------|
| Worker Thread 병렬화 | 스텁 | `engine/worker.ts` — 순차 실행, 200K 벤치마크 시 적용 |
| E2E 테스트 (Playwright) | 미작성 | Playwright + Electron 설정 필요 |
| 컴포넌트 테스트 | 미작성 | @testing-library/react 설정 필요 |
| Auto-updater | 설정만 | 코드 서명(Apple/Windows) 미적용 |
| 다국어 (i18n) | 구조만 | UiSettings.language 정의됨, 실제 번역 미적용 |

---

## 6. 리포트 위치

| 리포트 | 경로 |
|--------|------|
| 기획 의도 검증 (Codex) | `docs/reports/codex-planning-review.md` |
| 보안 감사 | `docs/reports/security-audit.md` |
| 프론트엔드 리뷰 | `docs/reports/frontend-review.md` |
