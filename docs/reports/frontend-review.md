# OptiShot Frontend Quality Review

**Date**: 2026-04-17
**Scope**: `src/renderer/` -- pages, components, stores, App.tsx
**Reviewer**: Automated (Claude Opus 4.6)

---

## Summary

The OptiShot renderer codebase is well-structured with clean component decomposition, consistent Tailwind styling, and reasonable Zustand store design. The code follows modern React patterns with functional components and hooks throughout. However, several issues across performance, accessibility, Electron IPC safety, and React best practices need attention before production readiness.

**Overall Assessment**: Good foundation with 26 findings requiring action.

| Category              | Critical | High | Medium | Low |
|-----------------------|----------|------|--------|-----|
| React Best Practices  | 1        | 3    | 3      | 1   |
| Performance           | 2        | 2    | 1      | 0   |
| Accessibility         | 1        | 3    | 2      | 0   |
| Component Architecture| 0        | 1    | 2      | 1   |
| Electron-specific     | 1        | 1    | 1      | 0   |

---

## 1. React Best Practices

### [CRITICAL] RBP-01: `formatBytes` duplicated across 7 files

The `formatBytes` utility function is copy-pasted into 7 separate files with minor formatting variations:
- `Dashboard.tsx` (line 7)
- `ScanProgress.tsx` (line 9)
- `GroupReview.tsx` (line 9)
- `GroupList.tsx` (line 5)
- `GroupDetail.tsx` (line 7)
- `PhotoGrid.tsx` (line 5)
- `ProgressOverlay.tsx` (line 10)
- `ExportSummary.tsx` (line 9)
- `TrashList.tsx` (line 11)
- `TrashSummary.tsx` (line 8)

Similarly, `formatDate` appears in 3+ files with slight differences.

**Fix**: Extract to `src/renderer/utils/format.ts` and import. This eliminates maintenance risk where a bug fix in one copy is missed in others. The inconsistent formatting logic (some use `toFixed(0)`, others use modulo checks) already demonstrates this risk.

---

### [HIGH] RBP-02: Missing `useEffect` cleanup for search debounce timer in `GroupList.tsx`

```typescript
// GroupList.tsx, line 33-39
const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

const handleSearchChange = (value: string) => {
  setSearch(value)
  if (searchTimeout.current) clearTimeout(searchTimeout.current)
  searchTimeout.current = setTimeout(() => {
    loadGroups()
  }, 300)
}
```

The timeout stored in `searchTimeout.current` is never cleaned up on unmount. If the component unmounts before the 300ms fires, `loadGroups()` will execute on a potentially stale store.

**Fix**: Add cleanup in a `useEffect` return:
```typescript
useEffect(() => {
  return () => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
  }
}, [])
```

---

### [HIGH] RBP-03: Unsafe `void formatBytes` to suppress unused variable

```typescript
// ScanProgress.tsx, line 17
void formatBytes
```

Using `void` to suppress an unused variable warning is a code smell. The function is defined but genuinely unused in this file.

**Fix**: Remove the local `formatBytes` definition from `ScanProgress.tsx` entirely. When needed, import from a shared utility.

---

### [HIGH] RBP-04: `PlaceholderPage` component defined but never used

```typescript
// App.tsx, lines 42-48
function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-center h-full">
      <h1 className="text-2xl font-heading font-bold text-foreground-muted">{title}</h1>
    </div>
  )
}
```

Dead code should be removed. If it was scaffolding for early development, it should have been cleaned up.

**Fix**: Remove `PlaceholderPage` from `App.tsx`.

---

### [MEDIUM] RBP-05: Zustand store selectors are not optimized

Multiple components destructure the entire store:

```typescript
// FolderSelect.tsx, line 12-13
const { folders, options, advancedOpen, loading, loadFolders, addFolder, removeFolder, setMode, setOption, toggleAdvanced } =
  useFolderStore()
```

```typescript
// Export.tsx, lines 107-127
const { targetPath, action, conflictStrategy, autoCreateFolder, ... } = useExportStore()
```

When any store property changes, every component subscribing to the entire store re-renders, even if it only uses a subset of values.

**Fix**: Use Zustand's selector pattern:
```typescript
const folders = useFolderStore((s) => s.folders)
const addFolder = useFolderStore((s) => s.addFolder)
```
Or use `useShallow` from `zustand/react/shallow` for multiple selectors:
```typescript
import { useShallow } from 'zustand/react/shallow'
const { folders, loading } = useFolderStore(useShallow((s) => ({ folders: s.folders, loading: s.loading })))
```

---

### [MEDIUM] RBP-06: `handleRestoreOne` in `Trash.tsx` directly mutates store state

```typescript
// Trash.tsx, lines 40-50
const handleRestoreOne = useCallback(
  async (id: string) => {
    const prev = new Set(selectedIds)
    useTrashStore.setState({ selectedIds: new Set([id]) })
    await restoreSelected()
    prev.delete(id)
    useTrashStore.setState({ selectedIds: prev })
  },
  [selectedIds, restoreSelected]
)
```

This manipulates the store selection state externally to restore a single item, which is fragile and creates a race condition if the user clicks multiple items quickly. The `selectedIds` in the closure may be stale by the time the Promise resolves.

**Fix**: Add a dedicated `restoreOne(id: string)` action to the trash store that handles single-item restore without manipulating the selection set.

---

### [MEDIUM] RBP-07: Sequential IPC calls in bulk operations

```typescript
// trash.ts store, lines 92-107
restoreSelected: async () => {
  const ids = Array.from(selectedIds)
  for (const id of ids) {
    await window.electron.invoke('trash:restore', id)
  }
```

Sequential `await` in a loop for N items creates O(N) round trips. For 50+ selected items, this will be noticeably slow.

**Fix**: Either batch the IPC call (preferred: `window.electron.invoke('trash:restoreBatch', ids)`) or use `Promise.all` with a concurrency limit.

---

### [LOW] RBP-08: `useCallback` usage inconsistency

In `Trash.tsx`, some handlers use `useCallback` (e.g., `handleSelectAll`, `handleEmptyTrash`) while page-level functions in other pages like `Dashboard.tsx` or `Settings.tsx` do not wrap handlers at all. This inconsistency makes it unclear what the performance intent is.

**Fix**: Establish a convention: use `useCallback` when passing handlers to memoized child components; otherwise, omit for simplicity.

---

## 2. Performance

### [CRITICAL] PERF-01: No virtualization for GroupList, TrashList, or DiscoveryFeed

The CLAUDE.md states a target of 200K images, which can produce thousands of duplicate groups and trash items. All three list components render every item in the DOM:

- `GroupList.tsx` (line 75): `groups.map(...)` renders all items. Paginated to 50, so acceptable for now, but pagination UX is inferior to virtual scrolling for fast browsing.
- `TrashList.tsx` (line 107): `items.map(...)` renders up to 200 items (hardcoded limit in store). With 30-day retention of a large library, this could be thousands.
- `DiscoveryFeed.tsx` (line 42): `discoveries.map(...)` with no cap. During a 200K-image scan, this array grows unbounded.

**Fix**:
- TrashList: Implement `@tanstack/react-virtual` or `react-window` for the item list. Remove the hardcoded 200-item limit and use cursor-based pagination.
- DiscoveryFeed: Cap the discovery array at ~100 items (ring buffer) or virtualize. The `max-h-[300px]` container mitigates DOM cost somewhat, but the state array still grows unboundedly in memory.
- GroupList: Current pagination is acceptable short-term, but virtual scrolling would provide a smoother review workflow.

---

### [CRITICAL] PERF-02: Thumbnail loading causes N+1 IPC calls without caching or throttling

```typescript
// PhotoGrid.tsx, PhotoThumbnail component
useEffect(() => {
  let cancelled = false
  window.electron
    .invoke('photos:thumbnail', photoId)
    .then(...)
  return () => { cancelled = true }
}, [photoId])
```

Each `PhotoThumbnail` instance fires an individual IPC call on mount. For a group with 20 duplicates visible simultaneously, this sends 20+ IPC calls in rapid succession. There is no client-side cache, so navigating away and back re-fetches every thumbnail.

The same pattern exists in `MasterThumbnail` in `GroupDetail.tsx`.

**Fix**:
- Implement a thumbnail cache (Map or LRU cache) in the renderer process
- Batch thumbnail requests where possible
- Consider `loading="lazy"` on `<img>` tags or an IntersectionObserver for off-screen thumbnails

---

### [HIGH] PERF-03: Inline function and object creation in JSX causes unnecessary re-renders

Multiple components create functions inline in JSX:

```typescript
// FolderSelect.tsx, line 53
onDateStartChange={(v) => setOption('dateStart', v)}

// Export.tsx, line 86
onKeyDown={(e) => e.key === 'Enter' || e.key === ' ' ? onClick() : undefined}

// SettingsTabs.tsx, line 87
onChange={(p) => applyPreset(p)}
```

While React handles this reasonably well, these create new function references on every render, defeating `React.memo` if applied to children.

**Fix**: For components that receive these as props and could benefit from memoization, extract handlers with `useCallback`. This is lower priority than the virtualization issues but matters for the Settings page which has many sliders triggering frequent re-renders.

---

### [HIGH] PERF-04: No debounce on scan progress updates

```typescript
// scan.ts store, startListening
const handler = (...args: unknown[]) => {
  const progress = args[0] as ScanProgress
  set({ progress })
```

The `scan:progress` event likely fires at high frequency (per-file during a 200K scan). Each event triggers a Zustand state update, which re-renders the entire ScanProgress page including the ProgressBar, ScanStats, and DiscoveryFeed.

**Fix**: Throttle progress updates to ~60fps (16ms) or batch them at ~250ms intervals:
```typescript
import { throttle } from 'lodash-es' // or manual implementation

const handler = throttle((...args: unknown[]) => {
  const progress = args[0] as ScanProgress
  set({ progress })
}, 250)
```

---

### [MEDIUM] PERF-05: Export store `browseFolder` has inconsistent return type assumption

```typescript
// export.ts, lines 63-75
browseFolder: async () => {
  const result = (await window.electron.invoke('dialog:openDirectory')) as
    | string | null | undefined
```

But in `folder.ts`:
```typescript
const dialogResult = (await window.electron.invoke('dialog:openDirectory')) as {
  success: boolean
  data?: string
}
```

The same IPC channel `dialog:openDirectory` is cast to two different types. One will break at runtime.

**Fix**: Standardize the return type. The `folder.ts` pattern with `{ success, data }` is more robust and should be used consistently.

---

## 3. Accessibility (WCAG)

### [CRITICAL] A11Y-01: Modals lack focus trapping and keyboard dismissal

```typescript
// Export.tsx, CompletionDialog and ProgressOverlay.tsx
<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
```

Neither `CompletionDialog` nor `ProgressOverlay`:
- Traps focus within the modal (Tab can reach elements behind the backdrop)
- Supports Escape key to close
- Uses `role="dialog"` or `aria-modal="true"`
- Manages focus return to the triggering element on close

**Fix**: Add `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to the title. Implement focus trapping (consider `@radix-ui/react-dialog` or manual implementation). Add Escape key handler.

---

### [HIGH] A11Y-02: HeaderBar buttons lack accessible names

```typescript
// HeaderBar.tsx
<button className="p-2 rounded-xl hover:bg-surface-secondary" title="Help">
  <HelpCircle className="w-5 h-5 text-foreground-muted" />
</button>
```

Icon-only buttons use `title` attribute but lack `aria-label`. Screen readers may not announce `title` consistently.

**Fix**: Add `aria-label="Help"` and `aria-label="Settings"` to both buttons.

---

### [HIGH] A11Y-03: Custom radio buttons in `ConflictOption` have incorrect keyboard interaction

```typescript
// Export.tsx, ConflictOption
<div
  role="radio"
  aria-checked={selected}
  tabIndex={0}
  onClick={onClick}
  onKeyDown={(e) => e.key === 'Enter' || e.key === ' ' ? onClick() : undefined}
>
```

Issues:
- Missing `role="radiogroup"` on the parent container
- Arrow key navigation (Up/Down, Left/Right) is not implemented per WAI-ARIA radio group pattern
- `Space` key should `preventDefault()` to avoid page scroll
- The `onKeyDown` handler does not call `preventDefault()`, so `Enter` may submit a parent form

**Fix**: Use native `<input type="radio">` with `sr-only` class for the actual radio, or implement full WAI-ARIA radiogroup keyboard pattern with arrow key support.

---

### [HIGH] A11Y-04: Toggle switches lack accessible labels

```typescript
// SettingsTabs.tsx, Toggle component
<button
  onClick={onToggle}
  className={...}
  role="switch"
  aria-checked={on}
>
```

The `Toggle` component has `role="switch"` and `aria-checked` but no `aria-label` or `aria-labelledby`. Screen readers will announce "switch, checked" without any indication of what it controls.

Similarly in `AdvancedSettings.tsx` (line 127-134), the correction detection toggle has `role="switch"` and `aria-checked` but no label association.

**Fix**: Pass a `label` prop to `Toggle` and use `aria-label`, or connect via `aria-labelledby` pointing to the ToggleCard's label text. In `ToggleCard`, use `useId()` to generate a label ID:
```typescript
const labelId = useId()
// ...
<p id={labelId} ...>{label}</p>
<Toggle on={value} onToggle={onToggle} aria-labelledby={labelId} />
```

---

### [MEDIUM] A11Y-05: Folder remove buttons are invisible until hover

```typescript
// FolderList.tsx, line 40-41
className="ml-3 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 ..."
```

The remove button has `opacity-0` by default and only appears on hover. This makes it:
- Invisible and unreachable for keyboard-only users (it can receive focus but is visually hidden)
- Inaccessible to users who cannot hover (touch, keyboard, some assistive devices)

**Fix**: Use `opacity-0 group-hover:opacity-100 focus-visible:opacity-100` to ensure keyboard focus reveals the button. Alternatively, always show the button at reduced emphasis.

---

### [MEDIUM] A11Y-06: Trash restore button is invisible until hover

```typescript
// TrashList.tsx, line 84
className="... opacity-0 group-hover:opacity-100"
```

Same issue as A11Y-05. The restore button is completely hidden from keyboard users.

**Fix**: Add `focus-visible:opacity-100` or always show the button.

---

## 4. Component Architecture

### [HIGH] ARCH-01: `ReviewActionBar` is tightly coupled to store inside `GroupReview.tsx`

```typescript
// GroupReview.tsx, lines 36-82
function ReviewActionBar() {
  const { groups, total, groupDetail, keepAll, markReviewed } = useReviewStore()
  // ...
}
```

`ReviewActionBar` is defined as a local function inside `GroupReview.tsx`, making it untestable in isolation and non-reusable. It directly accesses the Zustand store and performs computations (counting reviewed groups, summing reclaimable sizes) that should be derived state in the store or memoized values.

**Fix**: Extract to `components/ReviewActionBar.tsx`. Move `reviewedCount` and `totalReclaimable` computations into the store as derived selectors or compute with `useMemo`.

---

### [MEDIUM] ARCH-02: `EmptyState` and `StatusBadge` are locally scoped utility components

`EmptyState` in `GroupReview.tsx` and `StatusBadge` in `RecentScanCard.tsx` are potentially reusable but locked inside page/component files. The empty state pattern repeats across `GroupReview`, `TrashList`, and `FolderList` with different icons and text but the same structure.

**Fix**: Extract a generic `EmptyState` component:
```typescript
interface EmptyStateProps {
  icon: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}
```

---

### [MEDIUM] ARCH-03: Settings tabs export 4 components from a single 410-line file

`SettingsTabs.tsx` exports `ScanTab`, `UITab`, `DataTab`, and `InfoTab`, each substantial enough to be its own file. This file also defines local utility components (`Toggle`, `ToggleCard`, `SectionHeader`) that are reused across tabs.

**Fix**: Split into:
- `components/settings/ScanTab.tsx`
- `components/settings/UITab.tsx`
- `components/settings/DataTab.tsx`
- `components/settings/InfoTab.tsx`
- `components/ui/Toggle.tsx`
- `components/ui/ToggleCard.tsx`

---

### [LOW] ARCH-04: `hooks/` directory is empty

The `src/renderer/hooks/` directory exists but contains no files. Custom hooks could extract common patterns:
- `useIpcListener(channel, handler)` -- standardized IPC event subscription with cleanup
- `useThumbnail(photoId)` -- shared thumbnail loading with caching
- `useConfirm(message)` -- confirmation dialog abstraction (replacing `window.confirm`)

**Fix**: Extract at least `useIpcListener` to reduce boilerplate in ScanProgress, Export, and future event-driven pages.

---

## 5. Electron-Specific Frontend

### [CRITICAL] ELEC-01: IPC return types are cast with `as` without runtime validation

Every IPC call uses TypeScript `as` casts without any runtime validation:

```typescript
// dashboard.ts
const result = (await window.electron.invoke('stats:get')) as {
  success: boolean
  data?: { ... }
}

// review.ts
const result = (await window.electron.invoke('groups:list', { ... })) as
  { groups: GroupListItem[]; total: number } | undefined
```

The `as` cast provides zero runtime safety. If the main process returns an unexpected shape (e.g., after an API change, or an error object), the renderer will silently use incorrect data or crash with an obscure error.

Additionally, some stores check `result.success` (dashboard, folder) while others check for `undefined` (review) -- there is no consistent error handling contract.

**Fix**:
1. Define a shared `IpcResult<T>` type in `shared/types.ts`:
   ```typescript
   type IpcResult<T> = { success: true; data: T } | { success: false; error: string }
   ```
2. Create a typed `ipc.invoke<T>(channel, ...args)` wrapper in the renderer that validates the response shape at runtime and throws on `{ success: false }`.
3. Use the shared `IPC` constants from `shared/types.ts` for channel names (currently hardcoded strings).

---

### [HIGH] ELEC-02: IPC channel names are hardcoded strings, ignoring the shared `IPC` constants

`shared/types.ts` defines a comprehensive `IPC` constant object:
```typescript
export const IPC = {
  FOLDERS: { ADD: 'folders:add', ... },
  SCAN: { START: 'scan:start', ... },
  ...
}
```

But every store uses hardcoded string literals:
```typescript
await window.electron.invoke('stats:get')      // Not in IPC constants at all
await window.electron.invoke('folders:list')    // Should be IPC.FOLDERS.LIST
await window.electron.invoke('scan:start')      // Should be IPC.SCAN.START
```

Some channels used in the renderer (`stats:get`, `dialog:openDirectory`, `shell:openPath`) are not defined in `IPC` at all.

**Fix**: Import and use `IPC` constants throughout. Add missing channels (`STATS`, `DIALOG`, `SHELL`) to the shared constants.

---

### [MEDIUM] ELEC-03: `InfoTab` accesses `process.versions` without null safety

```typescript
// SettingsTabs.tsx, line 378
{ label: 'Electron', value: process.versions.electron ?? '---' },
{ label: 'Node', value: process.versions.node ?? '---' },
```

In the renderer process, `process.versions` may not be available depending on `nodeIntegration` and `contextIsolation` settings. If `contextIsolation: true` (recommended), `process` is undefined in the renderer.

**Fix**: Expose version info through the preload script:
```typescript
// preload/index.ts
contextBridge.exposeInMainWorld('electron', {
  versions: { electron: process.versions.electron, node: process.versions.node, chrome: process.versions.chrome },
  // ...
})
```

---

## 6. Bonus Findings

### BONUS-01: `window.confirm` used for destructive operations

```typescript
// Trash.tsx
const confirmed = window.confirm('Permanently delete all items in trash?')
```

`window.confirm` produces a native browser dialog that:
- Cannot be styled to match the app's design system
- Blocks the renderer process synchronously
- Looks jarring in an Electron app

**Fix**: Build a custom `ConfirmDialog` component (similar to the existing `CompletionDialog` pattern) or use a lightweight library like `@radix-ui/react-alert-dialog`.

---

### BONUS-02: No error boundary at the app level

`App.tsx` renders routes directly without an `ErrorBoundary`. An uncaught render error in any page will crash the entire app with a white screen.

**Fix**: Wrap `<Routes>` with a React Error Boundary component that shows a user-friendly fallback and offers a "return to Dashboard" action.

---

### BONUS-03: No loading/error states for initial IPC data loads

Several pages call `loadX()` in `useEffect` but only show a loading spinner or nothing while waiting. If the IPC call fails, the error is caught and logged to console, but the user sees a perpetually "empty" state with no indication of failure.

Affected: Dashboard, FolderSelect, GroupReview, Export, Trash, Settings.

**Fix**: Add an `error` state to each store and display user-visible error messages when IPC calls fail.

---

## Priority Action Items

### Immediate (before first release)
1. **ELEC-01**: Add runtime IPC response validation -- prevents silent data corruption
2. **A11Y-01**: Add focus trapping to modals -- WCAG 2.1 AA requirement
3. **PERF-01**: Virtualize TrashList and cap DiscoveryFeed -- prevents memory exhaustion
4. **PERF-02**: Cache thumbnails in renderer -- prevents IPC flooding

### Next Sprint
5. **RBP-01**: Extract shared utilities (`formatBytes`, `formatDate`)
6. **RBP-02**: Clean up debounce timer in GroupList
7. **PERF-04**: Throttle scan progress updates
8. **A11Y-04**: Add labels to all toggle switches
9. **ELEC-02**: Use shared IPC constants
10. **PERF-05**: Fix inconsistent `dialog:openDirectory` return type

### Backlog
11. **RBP-05**: Optimize Zustand selectors
12. **ARCH-01-04**: Component extraction and architecture cleanup
13. **A11Y-02, A11Y-03**: Fix keyboard navigation gaps
14. **BONUS-01-03**: Custom dialogs, error boundaries, error states
