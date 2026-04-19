# OptiShot CQRS Architecture Spec v2

> v2 — Codex 검증 피드백 반영 (2026-04-19)

## 1. 목표

현재 개별 IPC 채널을 **3개 버스**로 통합하되, **점진적 마이그레이션**으로 기능 회귀 방지:
- **CommandBus**: 상태 변경 (21개) — Renderer → Main
- **QueryBus**: 데이터 조회 (16개) — Renderer → Main
- **EventBus**: 알림 (5개) — Main → Renderer
- 플러그인 아키텍처의 기반이 되는 확장 가능한 메시지 시스템

## 2. 아키텍처

```
Renderer (React/Zustand)
  │
  ├── command('folder.add', { path })  ──┐
  ├── query('group.list', { offset })  ──┤  contextBridge
  └── subscribe('scan.progress', cb)   ──┘
                                          │
                                     [ Preload ]
                                     allowlist 검증
                                          │
                                   3 IPC Channels
                                          │
                              ┌───────────┼───────────┐
                              │           │           │
                         'cqrs:cmd'  'cqrs:qry'  'cqrs:evt:{type}'
                              │           │           │
Main Process             CommandBus   QueryBus    EventBus
                         allowlist     allowlist
                         + Zod 검증    + Zod 검증
                              │           │           │
                         ┌────┴────┐  ┌───┴───┐  ┌───┴───┐
                         │Handler  │  │Handler│  │Publish │
                         │Registry │  │Registry│ │        │
                         └────┬────┘  └───┬───┘  └───┬───┘
                              │           │          │
                         Service Layer (변경 없음)
```

## 3. 채널 이름 매핑

기존 채널명 → CQRS 타입명 매핑. 복수형→단수형, 콜론→도트.

| 기존 채널 | CQRS 타입 | 분류 | 비고 |
|-----------|-----------|------|------|
| `folders:add` | `folder.add` | Command | |
| `folders:remove` | `folder.remove` | Command | |
| `folders:list` | `folder.list` | Query | |
| `folders:validate` | `folder.validate` | Query | |
| `scan:start` | `scan.start` | Command | |
| `scan:pause` | `scan.pause` | Command | |
| `scan:cancel` | `scan.cancel` | Command | |
| `scan:status` | `scan.status` | Query | |
| `scan:progress` | `scan.progress` | Event | |
| `groups:list` | `group.list` | Query | |
| `groups:detail` | `group.detail` | Query | |
| `groups:changeMaster` | `group.changeMaster` | Command | |
| `groups:markReviewed` | `group.markReviewed` | Command | |
| `photos:info` | `photo.info` | Query | |
| `photos:thumbnail` | `photo.thumbnail` | Query | 캐시 생성 부수효과 허용 (주1) |
| `photos:exif` | `photo.exif` | Query | |
| `reviews:getPending` | `review.getPending` | Query | |
| `export:start` | `export.start` | Command | |
| `export:pause` | `export.pause` | Command | |
| `export:cancel` | `export.cancel` | Command | |
| `export:progress` | `export.progress` | Event | |
| `trash:list` | `trash.list` | Query | |
| `trash:summary` | `trash.summary` | Query | |
| `trash:move` | `trash.move` | Command | |
| `trash:restore` | `trash.restore` | Command | |
| `trash:restoreGroup` | `trash.restoreGroup` | Command | |
| `trash:delete` | `trash.delete` | Command | |
| `trash:empty` | `trash.empty` | Command | |
| `settings:get` | `settings.get` | Query | |
| `settings:save` | `settings.save` | Command | 갱신된 설정 반환 |
| `settings:reset` | `settings.reset` | Command | 기본값 반환 |
| `stats:get` | `stats.dashboard` | Query | 명확한 이름 |
| `scans:list` | `stats.scanHistory` | Query | 명확한 이름 |
| `maintenance:clearCache` | `maintenance.clearCache` | Command | |
| `maintenance:clearScanHistory` | `maintenance.clearScanHistory` | Command | |
| `maintenance:storageStats` | `maintenance.storageStats` | Query | |
| `app:info` | `app.info` | Query | |
| `dialog:openDirectory` | `dialog.openDirectory` | Command | OS 다이얼로그 부수효과 (주2) |
| `shell:openPath` | `shell.openPath` | Command | |
| `updater:check` | `updater.check` | Command | 네트워크 부수효과 |
| `updater:download` | `updater.download` | Command | |
| `updater:install` | `updater.install` | Command | |
| `updater:available` | `updater.available` | Event | |
| `updater:progress` | `updater.progress` | Event | |
| `updater:downloaded` | `updater.downloaded` | Event | |

> **주1**: `photo.thumbnail`은 캐시 파일 생성 부수효과가 있지만, 의미적으로는 "썸네일 경로를 반환"하는 Query. CQRS 순수성보다 사용 의미를 우선.
> **주2**: `dialog.openDirectory`는 OS 다이얼로그를 여는 부수효과가 있으므로 Command로 재분류. 반환값이 있는 Command (user interaction command).

## 4. 타입 시스템

### 4.1 CommandMap — 실제 핸들러 시그니처 기준

```typescript
// shared/cqrs/commands.ts

// 리뷰 결정 타입 (실제 핸들러 기준)
type ReviewDecision = 'kept_all' | 'duplicates_deleted'

export interface CommandMap {
  // Folder
  'folder.add': {
    input: { path: string; includeSubfolders?: boolean }  // Zod: folderAddSchema
    result: FolderRecord
  }
  'folder.remove': {
    input: { id: string }
    result: void
  }

  // Scan
  'scan.start': {
    input: {                                               // Zod: scanStartSchema
      mode: ScanMode
      phashThreshold: number      // 4-16
      ssimThreshold: number       // 0.5-0.95
      timeWindowHours: number     // 0-24
      parallelThreads: number     // 1-16
      batchSize?: number
    }
    result: { processedFiles: number; groups: unknown[] }
  }
  'scan.pause':   { input: void; result: void }
  'scan.cancel':  { input: void; result: void }

  // Group
  'group.changeMaster': {
    input: { groupId: string; newMasterId: string }       // Zod: validateStringId 양쪽
    result: void
  }
  'group.markReviewed': {
    input: { groupId: string; decision?: ReviewDecision }  // 'kept_all' | 'duplicates_deleted'
    result: void
  }

  // Export
  'export.start': {
    input: {                                               // Zod: exportStartSchema
      targetPath: string
      action: 'copy' | 'move'
      conflictStrategy: 'skip' | 'rename' | 'overwrite'
      autoCreateFolder: boolean
    }
    result: { processedFiles: number; totalSize: number }
  }
  'export.pause':  { input: void; result: void }
  'export.cancel': { input: void; result: void }

  // Trash
  'trash.move':         { input: { photoId: string }; result: { trashId: string; timestamp: string } }
  'trash.restore':      { input: { trashId: string }; result: void }
  'trash.restoreGroup': { input: { groupId: string }; result: { restoredCount: number } }
  'trash.delete':       { input: { trashId: string }; result: void }
  'trash.empty':        { input: void; result: { deletedCount: number } }

  // Settings — 실제로 갱신/초기화된 설정 객체를 반환
  'settings.save': {
    input: { section: 'scan' | 'ui' | 'data'; data: Record<string, unknown> }
    result: Record<string, unknown>   // 병합된 설정 반환
  }
  'settings.reset': {
    input: { section: 'scan' | 'ui' | 'data' }
    result: Record<string, unknown>   // 기본값 반환
  }

  // Maintenance
  'maintenance.clearCache':       { input: void; result: void }
  'maintenance.clearScanHistory': { input: void; result: void }

  // Dialog — 반환값이 있는 Command (OS 다이얼로그 부수효과)
  'dialog.openDirectory': {
    input: void
    result: string | null            // 선택한 경로, 취소 시 null
  }

  // Shell
  'shell.openPath': { input: { filePath: string }; result: void }

  // Updater
  'updater.check':    { input: void; result: UpdateInfo | null }
  'updater.download': { input: void; result: void }
  'updater.install':  { input: void; result: void }
}
```

### 4.2 QueryMap — 실제 핸들러 시그니처 기준

```typescript
// shared/cqrs/queries.ts
export interface QueryMap {
  // Folder
  'folder.list':     { input: void; result: FolderRecord[] }
  'folder.validate': { input: { path: string }; result: { isValid: boolean; isReadable: boolean; hasSubfolders: boolean } }

  // Scan
  'scan.status': { input: void; result: { state: string; scanId: string | null } }  // nullable, not optional

  // Group
  'group.list': {
    input: { offset?: number; limit?: number; search?: string; status?: string }
    result: GroupListItem[]
  }
  'group.detail': { input: { groupId: string }; result: GroupDetail }

  // Photo — thumbnail은 캐시 생성 부수효과 허용
  'photo.info':      { input: { photoId: string }; result: PhotoInfo }
  'photo.thumbnail': { input: { photoId: string }; result: string }    // 썸네일 경로
  'photo.exif':      { input: { photoId: string }; result: { path: string; exif: Record<string, unknown> } }

  // Review
  'review.getPending': { input: void; result: PendingDeletionRecord[] }

  // Trash
  'trash.list':    { input: { offset?: number; limit?: number }; result: TrashItem[] }
  'trash.summary': { input: void; result: TrashSummary }

  // Settings
  'settings.get': { input: { section: 'scan' | 'ui' | 'data' }; result: ScanSettings | UiSettings | DataSettings }

  // Stats
  'stats.dashboard':    { input: void; result: { totalPhotos: number; totalGroups: number; reclaimableSize: number; lastScan: ScanRecord | null } }
  'stats.scanHistory':  { input: void; result: ScanRecord[] }

  // Maintenance
  'maintenance.storageStats': { input: void; result: { dbSize: number; cacheSize: number } }

  // App
  'app.info': { input: void; result: { version: string; electron: string; node: string; chrome: string; platform: string } }
}
```

### 4.3 EventMap — 현재 코드에 실제 emit이 존재하는 것만

```typescript
// shared/cqrs/events.ts
export interface EventMap {
  // Scan — scan:start 핸들러 내 progressCallback에서 발행
  'scan.progress': {
    processedFiles: number
    totalFiles: number
    discoveredGroups: number
    currentFile: string
    elapsedSeconds: number
    estimatedRemainingSeconds: number
    scanSpeed: number
    skippedCount: number
  }

  // Export — export:start 핸들러 내 progressCallback에서 발행
  'export.progress': {
    processedFiles: number
    totalFiles: number
    transferredSize: number
    totalSize: number
    speed: number
    currentFile: string
  }

  // Updater — services/updater.ts에서 발행
  'updater.available':  { version: string; releaseDate: string }
  'updater.progress':   { percent: number; transferred: number; total: number }
  'updater.downloaded':  void
}
// 주의: scan.completed, export.completed는 현재 코드에 없음.
// 필요 시 v0.2에서 추가 (현재는 Command 반환값으로 완료를 알림)
```

### 4.4 공통 타입

```typescript
// shared/cqrs/bus.ts
export type CommandType = keyof CommandMap
export type QueryType = keyof QueryMap
export type EventType = keyof EventMap

export type CommandInput<K extends CommandType> = CommandMap[K]['input']
export type CommandResult<K extends CommandType> = CommandMap[K]['result']
export type QueryInput<K extends QueryType> = QueryMap[K]['input']
export type QueryResult<K extends QueryType> = QueryMap[K]['result']
export type EventPayload<K extends EventType> = EventMap[K]

export type CommandHandler<K extends CommandType> =
  (input: CommandInput<K>) => Promise<CommandResult<K>>

export type QueryHandler<K extends QueryType> =
  (input: QueryInput<K>) => Promise<QueryResult<K>>
```

## 5. Main Process 구현

### 5.1 CommandBus / QueryBus

```typescript
// main/cqrs/commandBus.ts
export class CommandBus {
  private handlers = new Map<string, (input: unknown) => Promise<unknown>>()

  register<K extends CommandType>(type: K, handler: CommandHandler<K>): void {
    if (this.handlers.has(type)) throw new Error(`Duplicate command handler: ${type}`)
    this.handlers.set(type, handler as (input: unknown) => Promise<unknown>)
  }

  has(type: string): boolean {
    return this.handlers.has(type)
  }

  async execute(type: string, input: unknown): Promise<unknown> {
    const handler = this.handlers.get(type)
    if (!handler) throw new Error(`No handler for command: ${type}`)
    return handler(input)
  }
}

// main/cqrs/queryBus.ts — 동일 구조
export class QueryBus { /* 동일 패턴 */ }
```

### 5.2 EventBus

```typescript
// main/cqrs/eventBus.ts
import { BrowserWindow } from 'electron'

export class EventBus {
  publish<K extends EventType>(type: K, payload: EventPayload<K>): void {
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send(`cqrs:evt:${type}`, payload)
      }
    })
  }
}
```

### 5.3 IPC 브릿지 — 이중 검증 (Codex 보안 권고 반영)

```typescript
// main/cqrs/ipcBridge.ts
import { ipcMain } from 'electron'
import { COMMAND_SCHEMAS, QUERY_SCHEMAS } from './schemas'  // type → Zod 매핑

export function registerCqrsBridge(
  commandBus: CommandBus,
  queryBus: QueryBus
): void {
  // Main 측 allowlist — Preload와 이중 검증
  const allowedCommands = new Set(commandBus.registeredTypes())
  const allowedQueries = new Set(queryBus.registeredTypes())

  ipcMain.handle('cqrs:cmd', async (_event, type: string, payload: unknown) => {
    // 1. Allowlist 검증
    if (!allowedCommands.has(type)) {
      return { success: false, error: `Unknown command: ${type}` }
    }
    // 2. Zod payload 검증 (스키마가 있는 경우)
    const schema = COMMAND_SCHEMAS[type]
    if (schema) {
      const parsed = schema.safeParse(payload)
      if (!parsed.success) {
        return { success: false, error: `Invalid payload: ${parsed.error.message}` }
      }
      payload = parsed.data
    }
    // 3. 실행
    try {
      const result = await commandBus.execute(type, payload)
      return { success: true, data: result }
    } catch (err) {
      // 내부 에러 상세 노출 방지
      console.error(`Command ${type} failed:`, err)
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('cqrs:qry', async (_event, type: string, payload: unknown) => {
    if (!allowedQueries.has(type)) {
      return { success: false, error: `Unknown query: ${type}` }
    }
    const schema = QUERY_SCHEMAS[type]
    if (schema) {
      const parsed = schema.safeParse(payload)
      if (!parsed.success) {
        return { success: false, error: `Invalid payload: ${parsed.error.message}` }
      }
      payload = parsed.data
    }
    try {
      const result = await queryBus.execute(type, payload)
      return { success: true, data: result }
    } catch (err) {
      console.error(`Query ${type} failed:`, err)
      return { success: false, error: (err as Error).message }
    }
  })
}
```

## 6. Preload — 화이트리스트 자동 생성

```typescript
// preload/allowlists.ts
// CommandMap/QueryMap/EventMap 키에서 빌드타임에 생성
// (CJS 번들에서는 런타임 import 불가이므로 const로 하드코딩)
export const ALLOWED_COMMANDS = new Set([
  'folder.add', 'folder.remove',
  'scan.start', 'scan.pause', 'scan.cancel',
  'group.changeMaster', 'group.markReviewed',
  'export.start', 'export.pause', 'export.cancel',
  'trash.move', 'trash.restore', 'trash.restoreGroup', 'trash.delete', 'trash.empty',
  'settings.save', 'settings.reset',
  'maintenance.clearCache', 'maintenance.clearScanHistory',
  'dialog.openDirectory', 'shell.openPath',
  'updater.check', 'updater.download', 'updater.install',
])

export const ALLOWED_QUERIES = new Set([
  'folder.list', 'folder.validate',
  'scan.status',
  'group.list', 'group.detail',
  'photo.info', 'photo.thumbnail', 'photo.exif',
  'review.getPending',
  'trash.list', 'trash.summary',
  'settings.get',
  'stats.dashboard', 'stats.scanHistory',
  'maintenance.storageStats',
  'app.info',
])

export const ALLOWED_EVENTS = new Set([
  'scan.progress',
  'export.progress',
  'updater.available', 'updater.progress', 'updater.downloaded',
])
```

```typescript
// preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'
import { ALLOWED_COMMANDS, ALLOWED_QUERIES, ALLOWED_EVENTS } from './allowlists'

const api = {
  command: (type: string, payload?: unknown) => {
    if (!ALLOWED_COMMANDS.has(type)) throw new Error(`Command not allowed: ${type}`)
    return ipcRenderer.invoke('cqrs:cmd', type, payload ?? null)
  },

  query: (type: string, payload?: unknown) => {
    if (!ALLOWED_QUERIES.has(type)) throw new Error(`Query not allowed: ${type}`)
    return ipcRenderer.invoke('cqrs:qry', type, payload ?? null)
  },

  subscribe: (type: string, callback: (payload: unknown) => void) => {
    if (!ALLOWED_EVENTS.has(type)) throw new Error(`Event not allowed: ${type}`)
    const channel = `cqrs:evt:${type}`
    const listener = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },
}

contextBridge.exposeInMainWorld('electron', api)
```

## 7. Renderer 타입 선언

```typescript
// renderer/env.d.ts
/// <reference types="vite/client" />
declare module '*.css' {}

interface Window {
  electron: {
    command: <K extends keyof import('@shared/cqrs').CommandMap>(
      type: K,
      ...args: import('@shared/cqrs').CommandMap[K]['input'] extends void ? [] : [import('@shared/cqrs').CommandMap[K]['input']]
    ) => Promise<import('@shared/types').IpcResponse<import('@shared/cqrs').CommandMap[K]['result']>>

    query: <K extends keyof import('@shared/cqrs').QueryMap>(
      type: K,
      ...args: import('@shared/cqrs').QueryMap[K]['input'] extends void ? [] : [import('@shared/cqrs').QueryMap[K]['input']]
    ) => Promise<import('@shared/types').IpcResponse<import('@shared/cqrs').QueryMap[K]['result']>>

    subscribe: <K extends keyof import('@shared/cqrs').EventMap>(
      type: K,
      callback: (payload: import('@shared/cqrs').EventMap[K]) => void
    ) => () => void
  }
}
```

## 8. 플러그인 인터페이스 (v0.2 대비)

```typescript
// shared/cqrs/plugin.ts

// 플러그인 ID 규칙: 소문자 + 숫자 + 하이픈, 3-32자
const PLUGIN_ID_REGEX = /^[a-z0-9][a-z0-9-]{2,31}$/
// 예약 prefix — 코어 네임스페이스와 충돌 방지
const RESERVED_PREFIXES = ['folder', 'scan', 'group', 'photo', 'review',
  'export', 'trash', 'settings', 'stats', 'maintenance', 'app', 'dialog',
  'shell', 'updater', 'cqrs', 'plugin']

export interface PluginManifest {
  id: string                     // 'ai-similarity' (PLUGIN_ID_REGEX)
  name: string                   // 표시 이름
  version: string                // semver
  permissions?: PluginPermission[]  // 요청 권한
}

export type PluginPermission =
  | 'fs.read'       // 파일 읽기
  | 'fs.write'      // 파일 쓰기
  | 'db.read'       // DB 읽기
  | 'db.write'      // DB 쓰기
  | 'network'       // 네트워크 접근

export interface DetectionPlugin {
  manifest: PluginManifest

  // 핸들러 — 자동으로 plugin.{id}.{name} 네임스페이스
  commands?: Record<string, (input: unknown) => Promise<unknown>>
  queries?: Record<string, (input: unknown) => Promise<unknown>>
  events?: string[]

  // 라이프사이클
  initialize?: (ctx: PluginContext) => Promise<void>
  dispose?: () => Promise<void>
}

export interface PluginContext {
  eventBus: EventBus              // 이벤트 발행 전용
  db: AppDatabase                 // 권한에 따라 접근 제한
  cacheDir: string                // 플러그인 전용 캐시 디렉토리
}

// 등록 — PluginRegistry가 관리
export class PluginRegistry {
  private plugins = new Map<string, DetectionPlugin>()

  register(plugin: DetectionPlugin, commandBus: CommandBus, queryBus: QueryBus): void {
    const { id } = plugin.manifest

    // ID 검증
    if (!PLUGIN_ID_REGEX.test(id)) throw new Error(`Invalid plugin id: ${id}`)
    if (RESERVED_PREFIXES.includes(id)) throw new Error(`Reserved plugin id: ${id}`)
    if (this.plugins.has(id)) throw new Error(`Plugin already registered: ${id}`)

    // 네임스페이스 핸들러 등록
    for (const [name, handler] of Object.entries(plugin.commands ?? {})) {
      commandBus.register(`plugin.${id}.${name}` as any, handler)
    }
    for (const [name, handler] of Object.entries(plugin.queries ?? {})) {
      queryBus.register(`plugin.${id}.${name}` as any, handler)
    }

    this.plugins.set(id, plugin)
  }

  unregister(id: string, commandBus: CommandBus, queryBus: QueryBus): void {
    // 해당 플러그인의 모든 핸들러 제거
    commandBus.unregisterPrefix(`plugin.${id}.`)
    queryBus.unregisterPrefix(`plugin.${id}.`)
    const plugin = this.plugins.get(id)
    plugin?.dispose?.()
    this.plugins.delete(id)
  }
}
```

## 9. 마이그레이션 전략 — 점진적 전환

### Phase 1: CQRS 인프라 (기존 API 유지)
1. `src/shared/cqrs/` 타입 정의 파일 생성
2. `src/main/cqrs/` 버스 구현 (CommandBus, QueryBus, EventBus)
3. `src/main/cqrs/ipcBridge.ts` — 새 IPC 진입점 (`cqrs:cmd`, `cqrs:qry`)
4. **기존 `ipc/handlers/` + `preload/index.ts`는 그대로 유지** — 양쪽 공존
5. 기존 핸들러 로직을 버스 핸들러로 래핑하여 등록
6. 기존 테스트 전체 통과 확인

### Phase 2: Preload 전환
1. Preload에 `command/query/subscribe` API 추가 (기존 `invoke/on`과 공존)
2. `env.d.ts` 업데이트 — 양쪽 API 타입 선언
3. **한 store씩** 점진 전환: `invoke(IPC.X.Y, a, b)` → `command('x.y', { a, b })`
4. 전환된 store 단위로 기존 테스트 + 수동 확인
5. 다중 인자 패턴 → 단일 payload 객체로 통일

### Phase 3: 정리
1. 모든 Renderer 코드가 새 API만 사용하는 것 확인
2. 기존 `invoke/on` API 제거 (Preload)
3. 기존 `src/main/ipc/handlers/` 제거 (버스 핸들러로 완전 이전)
4. `src/shared/types.ts`에서 `IPC` 상수 제거
5. 전체 테스트 + E2E 통과 확인

### Phase 4: 플러그인 (v0.2)
1. `PluginRegistry` 구현
2. 기존 pHash+SSIM을 첫 번째 내장 플러그인으로 추출
3. 설정 UI에 플러그인 on/off 섹션 추가

## 10. 보안 설계 (Codex 권고 반영)

### 이중 검증 아키텍처
```
Renderer → [Preload allowlist] → IPC → [Main allowlist + Zod] → Handler
```

1. **Preload 레이어**: type 문자열 allowlist 검증 (ALLOWED_COMMANDS/QUERIES/EVENTS)
2. **Main IPC Bridge**: type allowlist 재검증 + Zod payload 스키마 검증
3. **Handler 내부**: 비즈니스 로직 검증 (기존 유지)

### 에러 노출 제한
- 미등록 type: `Unknown command/query: {type}` (내부 구조 미노출)
- Zod 실패: `Invalid payload` + Zod 에러 메시지 (개발 편의)
- Handler 예외: `(err as Error).message` (프로덕션에서는 generic 에러로 교체 가능)

### 플러그인 격리
- `plugin.*` 네임스페이스 강제 — 코어 네임스페이스 접근 불가
- 권한 매니페스트로 fs/db/network 접근 제어
- 플러그인 이벤트는 `plugin.{id}.*` prefix만 발행 가능

## 11. 테스트 전략

- **기존 202개 테스트**: 서비스 레이어 직접 테스트 → **변경 불필요**
- **추가 단위 테스트**:
  - CommandBus: register, execute, duplicate rejection, unknown type
  - QueryBus: 동일
  - EventBus: publish, destroyed window 처리
  - IpcBridge: allowlist 거부, Zod 검증 실패, 성공 케이스
- **통합 테스트**: 기존 기능 시나리오를 새 API로 동일하게 수행
- **회귀 방지**: Phase 2에서 각 store 전환 시마다 `bun run test` 통과 확인

## 12. 파일 구조

```
src/
├── shared/
│   ├── cqrs/
│   │   ├── index.ts              # re-export all
│   │   ├── commands.ts           # CommandMap
│   │   ├── queries.ts            # QueryMap
│   │   ├── events.ts             # EventMap
│   │   ├── bus.ts                # 공통 타입 (Handler, Input/Result 헬퍼)
│   │   └── plugin.ts             # DetectionPlugin, PluginRegistry
│   ├── types.ts                  # 도메인 타입 (IPC 상수는 Phase 3에서 제거)
│   └── utils.ts
├── main/
│   ├── cqrs/
│   │   ├── commandBus.ts
│   │   ├── queryBus.ts
│   │   ├── eventBus.ts
│   │   ├── ipcBridge.ts          # ipcMain.handle 2개 + 이중 검증
│   │   ├── schemas.ts            # type → Zod 매핑 (기존 validators.ts 통합)
│   │   ├── handlers/
│   │   │   ├── folder.ts         # folder.add(C), folder.remove(C), folder.list(Q), folder.validate(Q)
│   │   │   ├── scan.ts           # scan.start(C), scan.pause(C), scan.cancel(C), scan.status(Q)
│   │   │   ├── group.ts          # group.changeMaster(C), group.markReviewed(C), group.list(Q), group.detail(Q)
│   │   │   ├── photo.ts          # photo.info(Q), photo.thumbnail(Q), photo.exif(Q)
│   │   │   ├── review.ts         # review.getPending(Q)
│   │   │   ├── export.ts         # export.start(C), export.pause(C), export.cancel(C)
│   │   │   ├── trash.ts          # trash.*(C/Q)
│   │   │   ├── settings.ts       # settings.save(C), settings.reset(C), settings.get(Q)
│   │   │   ├── stats.ts          # stats.dashboard(Q), stats.scanHistory(Q)
│   │   │   ├── maintenance.ts    # maintenance.*(C/Q)
│   │   │   ├── app.ts            # app.info(Q), dialog.openDirectory(C), shell.openPath(C)
│   │   │   ├── updater.ts        # updater.check(C), updater.download(C), updater.install(C)
│   │   │   └── register.ts       # 모든 핸들러를 CommandBus/QueryBus에 등록
│   │   └── plugins/              # v0.2 대비
│   ├── ipc/                      # Phase 1-2에서 유지, Phase 3에서 제거
│   ├── services/                 # 변경 없음
│   └── engine/                   # 변경 없음
├── preload/
│   ├── index.ts                  # command/query/subscribe API
│   └── allowlists.ts             # 화이트리스트
└── renderer/
    ├── env.d.ts                  # command/query/subscribe 타입
    ├── stores/                   # Phase 2에서 점진 전환
    └── ...
```
