# CQRS 설계 v2 검증 보고서

검증 대상:
- 설계 문서: `docs/planning/10-cqrs-architecture.md` (v2)
- 이전 리뷰: `docs/reports/cqrs-design-review.md`
- 실제 코드(요청 범위):
  - `src/main/ipc/handlers/*.ts` 전체
  - `src/main/ipc/validators.ts`
  - `src/shared/types.ts`
  - `src/preload/index.ts`
  - `src/main/services/settings.ts`
  - `src/main/services/updater.ts`
- 추가 교차확인(타입 정확성): `src/main/services/group.ts`, `src/main/services/scan.ts`

---

## 요약 결론

- **이전 High 5건은 "완전 해결"이 아니라 "4건 해결 + 1건 부분 해결"**로 판단.
- `settings.save/reset`, `group.markReviewed`, `scan.status`, `dialog.openDirectory` 분류 개선은 v2에서 유의미하게 반영됨.
- 다만 보안/이행 관점에서 **문서 예시의 구현 누락(버스 API 불일치), 검증 범위 불완전, 계약 세부 불일치**가 남아 있음.

---

## 1) 이전 리뷰 High 이슈 5건 해결 여부

기준(이전 리뷰의 핵심 High):
1. `settings.save/reset` 반환값 불일치
2. `group.markReviewed.decision` 타입 불일치
3. `scan.status` nullable/optional 불일치
4. 다중 인자 → 단일 payload 전환 리스크 미대응
5. CQRS 단일 브릿지 보안(메인 런타임 검증 부재)

판정:
- 1번: **해결**
  - v2에서 `settings.save/reset` 결과를 객체 반환으로 수정 (`docs/planning/10-cqrs-architecture.md:165`, `docs/planning/10-cqrs-architecture.md:170`).
- 2번: **해결**
  - v2에서 `group.markReviewed`를 `'kept_all' | 'duplicates_deleted'`로 명시 (`docs/planning/10-cqrs-architecture.md:139`).
- 3번: **해결**
  - v2에서 `scan.status`를 `scanId: string | null`로 명시 (`docs/planning/10-cqrs-architecture.md:204`).
- 4번: **부분 해결**
  - 점진 전환 Phase가 추가되어 리스크 완화 (`docs/planning/10-cqrs-architecture.md:578`).
  - 그러나 실제 호출부가 여전히 variadic 중심이라 이행 난이도는 높음 (`src/preload/index.ts:37`, `src/main/ipc/handlers/groups.ts:42`, `src/main/ipc/handlers/settings.ts:36`, `src/main/ipc/handlers/folders.ts:22`).
- 5번: **부분 해결**
  - v2는 Preload+Main 이중 검증 설계를 반영 (`docs/planning/10-cqrs-architecture.md:609`).
  - 하지만 문서 예시 코드 자체에 API 불일치가 있어 즉시 구현 가능 상태는 아님 (`registeredTypes`, `unregisterPrefix` 사용 vs 버스 정의 미제시; `docs/planning/10-cqrs-architecture.md:355`, `docs/planning/10-cqrs-architecture.md:569`, `docs/planning/10-cqrs-architecture.md:303`).

=> 종합: **완전 해결 아님 (5건 중 3건 해결, 2건 부분 해결)**.

---

## 2) `settings.save/reset` 반환 타입 실제 일치성

판정: **대체로 일치(반환값 존재는 정확), 단 타입 정밀도는 불일치**.

근거:
- 실제 서비스는 섹션별 구체 타입을 반환:
  - `saveSettings(...): SettingsStore[K]` (`src/main/services/settings.ts:135`)
  - `resetSettings(...): SettingsStore[K]` (`src/main/services/settings.ts:148`)
- 실제 IPC 핸들러도 `data`에 반환 객체를 전달 (`src/main/ipc/handlers/settings.ts:39`, `src/main/ipc/handlers/settings.ts:53`).
- v2 문서는 `Record<string, unknown>`로 기술 (`docs/planning/10-cqrs-architecture.md:167`, `docs/planning/10-cqrs-architecture.md:171`).

평가:
- "`void`가 아닌 객체 반환"이라는 핵심 수정은 맞음.
- 다만 문서 타입이 실제보다 느슨하여 타입 안정성 손실 가능.

---

## 3) `group.markReviewed`의 `decision` 타입 실제 일치성

판정: **일치**.

근거:
- 핸들러에서 `'kept_all' | 'duplicates_deleted'`만 허용 (`src/main/ipc/handlers/groups.ts:60`).
- 서비스 시그니처도 동일 (`src/main/services/group.ts:293`).
- v2 문서도 동일 의미로 명시 (`docs/planning/10-cqrs-architecture.md:140`).

주의:
- 레거시 타입/스키마에는 여전히 `keep|delete`가 남아 있어 혼선 여지:
  - `Decision = 'keep' | 'delete'` (`src/shared/types.ts:16`)
  - `reviewSetSchema.decision` (`src/main/ipc/validators.ts:36`)

---

## 4) `dialog.openDirectory` Command 재분류 적절성

판정: **재분류 자체는 적절**.

근거:
- 실제 구현은 OS 다이얼로그 호출이라는 명백한 부수효과를 수행 (`src/main/ipc/handlers/folders.ts:13`).
- v2도 Command로 재분류 (`docs/planning/10-cqrs-architecture.md:86`, `docs/planning/10-cqrs-architecture.md:179`).

추가 불일치:
- v2는 취소 시 `null` 반환 계약 (`docs/planning/10-cqrs-architecture.md:181`),
- 실제는 `success:false, error:'cancelled'` (`src/main/ipc/handlers/folders.ts:15`).

---

## 5) IpcBridge 이중 검증 구조 보안 충분성

판정: **방향은 맞지만, 현재 문서 수준만으로는 "충분" 판정 어려움**.

긍정 요소:
- Preload allowlist + Main allowlist + Zod 검증 체계 제안 (`docs/planning/10-cqrs-architecture.md:609`).

잔여 리스크:
- 문서 예시의 버스 API 불일치(`registeredTypes`, `unregisterPrefix`)로 실제 구현 누락 가능성 (`docs/planning/10-cqrs-architecture.md:355`, `docs/planning/10-cqrs-architecture.md:569`, `docs/planning/10-cqrs-architecture.md:303`).
- "스키마 없는 타입은 통과" 구조로 보이며, 모든 타입 강제 검증 여부가 불명확 (`docs/planning/10-cqrs-architecture.md:364`).
- 에러 메시지가 내부 예외 메시지를 직접 반환하는 설계 (`docs/planning/10-cqrs-architecture.md:400`, `docs/planning/10-cqrs-architecture.md:621`).
- 현재 실코드는 Main 측 중앙 allowlist/Zod 강제가 없고 채널별 부분 검증 혼재:
  - Preload 화이트리스트는 존재 (`src/preload/index.ts:5`)
  - Main은 핸들러별 검증 편차 (`src/main/ipc/handlers/scan.ts:21`, `src/main/ipc/handlers/groups.ts:59`, `src/main/ipc/handlers/trash.ts:48`).

---

## 6) 다중 인자 → 단일 payload 전환의 breaking change 위험

판정: **여전히 High risk(다만 v2가 완화 전략은 제시)**.

실제 다중 인자 사례:
- `settings:save(section, data)` (`src/main/ipc/handlers/settings.ts:36`)
- `groups:changeMaster(groupId, newMasterId)` (`src/main/ipc/handlers/groups.ts:42`)
- `groups:markReviewed(groupId, decision)` (`src/main/ipc/handlers/groups.ts:57`)
- `folders:add(path, includeSubfolders?)` (`src/main/ipc/handlers/folders.ts:22`)
- Preload API 자체가 variadic invoke 중심 (`src/preload/index.ts:37`)

v2 대응:
- 공존 단계 + store 단위 점진 전환 명시 (`docs/planning/10-cqrs-architecture.md:589`).

평가:
- "무리한 빅뱅 전환" 리스크는 낮췄지만, 호출부/테스트/타입 선언까지 광범위 수정 필요성은 그대로.

---

## 7) 점진적 마이그레이션 전략 실현 가능성

판정: **실현 가능(조건부)**.

가능한 이유:
- Phase 1에서 기존 API 유지/공존을 전제로 해 회귀 위험을 제어 (`docs/planning/10-cqrs-architecture.md:584`).
- 현재 구조가 핸들러 등록 중심이라 래핑 이관이 구조적으로 가능 (`src/main/ipc/register.ts:20`).

선결 조건:
- 문서 예시의 누락 API(`registeredTypes`, `unregisterPrefix`)를 실제 클래스로 먼저 확정.
- 채널명 rename 매핑(`stats:get`↔`stats.dashboard`, `scans:list`↔`stats.scanHistory`)에 대한 어댑터/호환기간 정의 필요 (`docs/planning/10-cqrs-architecture.md:80`, `src/main/ipc/handlers/stats.ts:10`, `src/main/ipc/handlers/stats.ts:54`).
- `settings` 입력/출력 타입을 섹션별 제네릭으로 강화하지 않으면 런타임/타입 괴리 확대 가능.

---

## 8) 신규 발견 이슈

1. **문서 예시 코드의 컴파일/구현 불일치**
- `CommandBus` 예시에는 `registeredTypes()`/`unregisterPrefix()`가 없는데 후속 섹션에서 사용.
- 위치: `docs/planning/10-cqrs-architecture.md:303`, `docs/planning/10-cqrs-architecture.md:355`, `docs/planning/10-cqrs-architecture.md:569`.

2. **`dialog.openDirectory` 취소 계약 불일치**
- v2는 `null` 반환, 실제는 실패 응답(`cancelled`).
- 위치: `docs/planning/10-cqrs-architecture.md:181`, `src/main/ipc/handlers/folders.ts:15`.

3. **Decision 타입 이원화(레거시 충돌)**
- 그룹 리뷰는 `kept_all|duplicates_deleted`인데 공용 타입/validator엔 `keep|delete` 잔존.
- 위치: `src/main/services/group.ts:293`, `src/shared/types.ts:16`, `src/main/ipc/validators.ts:36`.

4. **입력 검증 일관성 부족**
- 일부만 Zod(예: scan/export), 다수는 `validateStringId` 수준.
- 위치: `src/main/ipc/handlers/scan.ts:21`, `src/main/ipc/handlers/export.ts:19`, `src/main/ipc/handlers/groups.ts:59`.

5. **이벤트 모델은 v2가 현실화됐지만 완료 이벤트 미구현은 유지**
- `scan.progress`, `export.progress`, updater 3종은 실제 emit 확인.
- 완료 이벤트(`scan.completed`, `export.completed`)는 여전히 미구현이며 v2도 이를 인지.
- 위치: `src/main/ipc/handlers/scan.ts:26`, `src/main/ipc/handlers/export.ts:24`, `src/main/services/updater.ts:23`, `docs/planning/10-cqrs-architecture.md:272`.

---

## 최종 판단

- v2는 이전 리뷰의 핵심 문제를 상당 부분 반영했으며, 특히 타입 불일치 3건과 `dialog.openDirectory` 분류 개선은 긍정적.
- 그러나 보안/마이그레이션의 "실행 가능성"을 담보하려면, 문서 예시 코드의 API 정합성 보완과 타입 정밀도 개선이 추가로 필요.
- 따라서 현 상태 평가는 **"승인 가능(조건부)"**:
  - 필수 보완: 버스 API 정합성, `dialog` 취소 계약 통일, Decision 타입 단일화, 스키마 검증 커버리지 확장.
