# CQRS 설계 비판적 검증 보고서

검토 대상:
- 설계 문서: `docs/planning/10-cqrs-architecture.md`
- 실제 구현: `src/main/ipc/handlers/*.ts`, `src/shared/types.ts`, `src/preload/index.ts`

검토 기준:
1) Command/Query/Event 분류 정확성
2) 타입 시그니처 일치성
3) 단일 IpcBridge 보안성
4) 마이그레이션 breaking change 위험
5) 플러그인 네임스페이스 격리 수준
6) 누락 채널/엣지 케이스

---

## 요약 결론

- 제안된 CQRS 방향 자체(버스 분리, 타입 맵 중심)는 타당하다.
- 다만 현재 코드 기준으로는 **채널 명명 규칙/인자 형태/반환 타입**이 문서와 여러 지점에서 불일치한다.
- 특히 `settings`, `groups:markReviewed`, `scan:status`, `scans:list`는 타입 계약을 그대로 옮기면 런타임/타입 레벨 breaking 가능성이 높다.
- 보안 측면에서 “단일 진입점 2개 채널”은 단순화 이점이 있지만, 현재 화이트리스트 대비 기본적으로 공격면이 넓어질 수 있어 **Main 측 런타임 검증을 반드시 추가**해야 한다.

---

## 1) CommandMap / QueryMap / EventMap 분류 정확성

### 전반 평가

- 대부분의 분류는 합리적이다.
  - Command 성격: `folders:add/remove`, `scan:start/pause/cancel`, `groups:changeMaster/markReviewed`, `export:start/pause/cancel`, `trash:*`(조회 제외), `settings:save/reset`, `maintenance:clear*`, `updater:download/install`, `shell:openPath`
  - Query 성격: `folders:list/validate`, `scan:status`, `groups:list/detail`, `photos:info/thumbnail/exif`, `reviews:getPending`, `trash:list/summary`, `settings:get`, `stats:get`, `scans:list`, `maintenance:storageStats`, `app:info`, `updater:check`

### 경계/논쟁 지점

- `dialog.openDirectory`
  - 문서에서는 Query로 분류했지만, OS 다이얼로그를 여는 명백한 사이드이펙트가 있다.
  - “도메인 상태 비변경” 기준이면 Query로 유지 가능하나, 엄격 CQRS(부수효과 최소) 기준이면 Command로 보는 편이 자연스럽다.

- `photo.thumbnail`
  - 조회 API처럼 보이지만 실제로는 썸네일 캐시 디렉토리 생성 및 파일 생성 부수효과가 있다.
  - 현재 UX 관점 Query로 두어도 되지만, 캐시 생성 책임을 명시적으로 분리하지 않으면 CQRS 순수성은 낮아진다.

### 문서-실코드 누락/불일치

- 문서 EventMap에 `scan.completed`, `export.completed`가 있으나 실제 코드에서 해당 이벤트 emit이 없다(현재는 progress만 송신).
- 실제 조회 채널 `scans:list`가 문서에서는 `stats.scanList`로 이름이 바뀌어 있어 매핑 기준 문서화가 필요하다.

---

## 2) 타입 시그니처 vs 실제 핸들러 입출력 일치성

## 주요 불일치(High)

1. `settings.save` / `settings.reset` 반환값
- 문서 CommandMap: `result: void`
- 실제 핸들러: 둘 다 `data`로 갱신/초기화된 섹션 설정 객체를 반환
- 영향: Renderer가 반환값을 활용하는 코드에서 타입/런타임 모두 깨질 수 있음

2. `group.markReviewed`의 `decision` 타입
- 문서: `Decision`(`keep | delete`) 기반 뉘앙스
- 실제 핸들러/서비스: `'kept_all' | 'duplicates_deleted'`만 허용
- 영향: 타입 안전성 붕괴 또는 잘못된 값 전송 가능

3. `scan.status` 반환 타입
- 문서: `{ state: string; scanId?: string }`
- 실제: `{ state: string; scanId: string | null }`
- 영향: optional vs nullable 불일치로 분기 로직 오동작 가능

4. 호출 인자 형태(variadic → object)
- 문서 CQRS는 `(type, payloadObject)` 단일 payload를 가정
- 실제 핸들러 다수는 다중 인자 패턴 사용
  - `settings:save(section, data)`
  - `groups:changeMaster(groupId, newMasterId)`
  - `groups:markReviewed(groupId, decision)`
  - `folders:add(path, includeSubfolders?)`
- 영향: Preload/Renderer 전환 시 광범위한 호출부 수정 필요

## 중간 불일치(Medium)

5. 채널 네이밍 체계 불일치
- 문서: `folder.add`, `group.list`, `review.getPending`, `stats.scanList`
- 실제: `folders:add`, `groups:list`, `reviews:getPending`, `scans:list`
- 영향: 단순 rename이지만 전역 치환 수준 변경 필요

6. `settings.save` 입력 타입
- 문서: `{ section; data: Record<string, unknown> }`
- 실제: 섹션별 부분 타입(`Partial<SettingsStore[K]>`)에 가까운 구조
- 영향: 문서 타입대로면 타입이 과도하게 느슨해져 잘못된 키 저장 가능성 증가

## 대체로 일치하는 항목

- `scan.start`, `export.start`는 Zod 스키마와 문서 의도가 전반적으로 맞는다.
- `trash.restoreGroup`, `trash.empty`, `updater.check/download/install`, `app.info`, `maintenance.storageStats`는 큰 방향이 맞다.

---

## 3) 단일 IpcBridge 구조 보안성 (기존 화이트리스트 대비)

## 현재 구조(기존)

- Preload에서 `ALLOWED_INVOKE`, `ALLOWED_ON`으로 채널 단위 화이트리스트를 강제한다.
- 채널별 핸들러로 분산되어 있어 “허용 채널”과 “실행 로직”의 매핑이 직관적이다.

## 제안 구조(CQRS 2개 invoke + 이벤트 prefix)의 보안 리스크

1. 채널 단위 최소권한 약화 가능성
- `cqrs:cmd`, `cqrs:qry` 두 채널만 열리면, 실질 통제는 `type` 문자열 검증에 전적으로 의존한다.

2. Main 프로세스 런타임 검증 부재
- 문서 예시 `ipcBridge`는 `type as CommandType`/`QueryType` 캐스팅만 하고 런타임 allowlist 검증이 없다.
- 타입 캐스팅은 보안 통제가 아니며, 잘못된 type/payload가 버스까지 도달한다.

3. 에러 메시지 노출
- 미등록 type이나 내부 예외 메시지를 그대로 반환하면 내부 구조 노출 범위가 커질 수 있다.

4. 플러그인 동적 이벤트 화이트리스트 동기화 문제
- 문서의 `ALLOWED_EVENTS.add(...)`는 프로세스 경계(Preload/Main) 상 실제 동기화 메커니즘 없이는 동작 보장이 어렵다.

## 보완 권고(필수)

- Preload + Main **양쪽**에서 type allowlist를 강제(이중 검증)
- `type -> zod schema` 매핑으로 payload 런타임 검증
- 내부 예외는 표준 에러 코드로 매핑하고 상세 메시지 노출 제한
- `plugin.*`는 별도 권한/정책 레이어로 제한

결론: 단일 진입점 자체가 본질적으로 취약한 것은 아니지만, 현재 문서 수준 구현만으로는 기존 채널 화이트리스트 대비 안전하다고 보기 어렵다.

---

## 4) 마이그레이션 breaking change 위험

## High Risk

1. API 호출 패턴 변경
- `window.electron.invoke(channel, ...args)` → `command/query(type, payload)`
- 모든 스토어/컴포넌트 호출부 수정 필요

2. 채널 이름 전면 변경
- 콜론/복수형(`groups:list`)에서 도트/단수형(`group.list`)으로 변경
- 문자열 리터럴/상수 참조 전부 영향

3. `IPC` 상수 제거 계획
- `src/shared/types.ts`의 `IPC` 제거 시 기존 renderer/main 코드, 테스트, mocking 코드 대규모 수정 필요

4. 응답 타입 계약 변경 위험
- 현재는 `IpcResponse<T>` 관례 + 일부 핸들러의 실데이터 반환 패턴이 혼재
- CQRS 이전 시 `void`/`data` 계약을 잘못 정리하면 기능 회귀 발생

## Medium Risk

5. 이벤트 구독 API 변경
- `on(channel)` → `subscribe(type)` 전환 + 이벤트 채널 prefix 변경

6. 테스트 깨짐
- IPC 채널명, 인자 구조, preload mock API(`invoke/on`) 변경으로 테스트 스냅샷/목킹 실패 가능

## 권고 마이그레이션

- 1단계: 기존 `invoke/on`을 내부에서 CQRS로 라우팅하는 호환 어댑터 유지
- 2단계: 채널별 점진 전환 + 사용량 계측
- 3단계: 최종 제거 전 deprecated 경고 기간 운영

---

## 5) 플러그인 인터페이스 네임스페이스 격리 충분성

결론: **현재 문서 수준으로는 불충분**.

주요 이유:
- `plugin.{id}.{name}` 규칙만으로는 `id/name` 유효성(문자셋, 예약어, 길이) 보장이 없다.
- 플러그인 소유권/권한 모델이 없다(어떤 플러그인이 어떤 명령을 등록했는지 추적/제거 정책 미흡).
- 이벤트 allowlist 동적 추가를 가정하지만 Preload와 동기화 설계가 빠져 있다.
- 충돌 시나리오(동일 plugin id, 동일 name)와 재등록/언로드 정책이 명확하지 않다.

권고:
- `pluginId` 정규식 강제(예: `^[a-z0-9-]{3,32}$`), 예약 prefix 금지
- 등록 레지스트리에 `ownerPluginId` 저장 및 unload 시 일괄 해제
- 플러그인 권한 매니페스트(파일 접근, shell/openPath, updater 등) 추가
- 플러그인 이벤트는 별도 broker를 통해 sanitize 후 전달

---

## 6) 누락 채널 / 엣지 케이스

1. 완료 이벤트 누락
- 문서 EventMap의 `scan.completed`, `export.completed`는 실제 emit 코드 없음

2. `scans:list` 명명 정합성
- 현재 구현 채널은 `scans:list`, 문서는 `stats.scanList`
- 어떤 이름을 canonical로 할지 확정 필요

3. 취소/일시중지 에러 의미 충돌
- `dialog:openDirectory` 취소 시 `success:false`, `error:'cancelled'` 반환
- 사용자 취소를 에러로 볼지 정상 흐름(`data:null`)으로 볼지 계약 명확화 필요

4. Query의 부수효과
- `photo.thumbnail`는 캐시 생성(write)이 발생
- CQRS 규칙상 허용 여부를 팀 규칙으로 명시해야 함

5. 입력 검증 일관성
- 일부 핸들러는 Zod(예: scan/export), 다수는 단순 문자열 검증만 사용
- CQRS 전환 시 type별 schema 검증 체계 일원화 필요

6. 이벤트 수신 API 실제 사용 누락
- updater 이벤트는 송신/allowlist는 있으나 renderer 구독 사용이 거의 없음(사양 대비 구현 격차 가능성)

---

## 최종 판단

- 설계 방향은 맞지만, 현재 문서는 “이상적인 형태”에 가깝고 실코드와 계약 차이가 분명하다.
- 바로 전면 이관하면 breaking change 가능성이 높다.
- **권장 순서**: (1) 실제 채널/시그니처 기준의 CQRS Map 확정 → (2) Main 런타임 검증 추가 → (3) Preload 호환 레이어 유지한 점진 전환 → (4) 최종 정리.

