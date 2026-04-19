# OptiShot Security Audit Report

**Date**: 2026-04-17
**Scope**: All source files under `src/` (main, renderer, preload, shared)
**Auditor**: Security Specialist Agent

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 1     |
| HIGH     | 4     |
| MEDIUM   | 4     |
| LOW      | 3     |
| INFO     | 3     |

---

## CRITICAL

### SEC-01: Open IPC Bridge - No Channel Whitelist (A01: Broken Access Control)

**File**: `src/preload/index.ts:4`

```typescript
const api = {
  invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    // ...
  },
}
```

**Risk**: The preload script exposes a fully open IPC bridge to the renderer process. Any channel name can be invoked from the renderer with any arguments. This violates Electron's security best practices. If an attacker achieves XSS in the renderer (e.g., via a crafted filename rendered in the UI), they can invoke ANY registered `ipcMain.handle` channel -- including `updater:install` (force quit and install arbitrary update), `trash:empty` (destroy all trash), `trash:delete` (permanent deletion), or `export:start` with arbitrary targetPath.

**Evidence**: The renderer already calls `shell:openPath` at `src/renderer/components/GroupDetail.tsx:165`, which has NO registered handler on the main side -- proving the bridge accepts arbitrary channel names without restriction.

**Fix**: Implement a channel whitelist in the preload script:

```typescript
const ALLOWED_CHANNELS = new Set([
  'folders:add', 'folders:remove', 'folders:list', 'folders:validate',
  'dialog:openDirectory',
  'scan:start', 'scan:pause', 'scan:cancel', 'scan:status',
  'groups:list', 'groups:detail', 'groups:changeMaster', 'groups:markReviewed',
  'photos:info', 'photos:thumbnail',
  'reviews:set', 'reviews:bulkKeep', 'reviews:markExport',
  'export:start', 'export:pause', 'export:cancel',
  'trash:list', 'trash:summary', 'trash:move', 'trash:restore', 'trash:delete', 'trash:empty',
  'settings:get', 'settings:save', 'settings:reset',
  'stats:get',
  'updater:check', 'updater:download', 'updater:install',
])

const ALLOWED_RECEIVE = new Set([
  'scan:progress', 'export:progress',
  'updater:available', 'updater:progress', 'updater:downloaded',
])

const api = {
  invoke: (channel: string, ...args: unknown[]) => {
    if (!ALLOWED_CHANNELS.has(channel)) throw new Error(`Blocked IPC channel: ${channel}`)
    return ipcRenderer.invoke(channel, ...args)
  },
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    if (!ALLOWED_RECEIVE.has(channel)) throw new Error(`Blocked IPC channel: ${channel}`)
    // ...
  },
}
```

---

## HIGH

### SEC-02: Missing Content Security Policy (A05: Security Misconfiguration)

**File**: `src/renderer/index.html`

The HTML file has no `<meta http-equiv="Content-Security-Policy">` tag. Without CSP, if an attacker injects script (e.g., via a photo filename containing HTML/JS that gets rendered unsanitized), it can execute arbitrary JavaScript in the renderer context -- which, combined with SEC-01, grants full main-process IPC access.

**Fix**: Add a restrictive CSP:

```html
<meta http-equiv="Content-Security-Policy"
  content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' file: data:; font-src 'self';">
```

### SEC-03: Sandbox Disabled (A05: Security Misconfiguration)

**File**: `src/main/index.ts:16`

```typescript
webPreferences: {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: false,  // <-- should be true
}
```

**Risk**: `sandbox: false` allows the renderer process to access some Node.js APIs through the preload script's execution context. When combined with the open IPC bridge (SEC-01), this increases the blast radius of any renderer-side compromise. Electron's official security checklist recommends `sandbox: true`.

**Caveat**: Enabling sandbox may require adjustments to the preload script if it uses Node.js APIs directly. Since the current preload (`src/preload/index.ts`) only uses `contextBridge` and `ipcRenderer` (both available in sandboxed mode), enabling sandbox should be safe.

**Fix**: Set `sandbox: true`.

### SEC-04: No IPC Payload Validation (A03: Injection / A04: Insecure Design)

**All files in**: `src/main/ipc/handlers/*.ts`

No IPC handler validates its incoming payload. TypeScript annotations provide compile-time safety only; at runtime, the renderer can send ANY type of data for any argument. There is no Zod, joi, or manual validation.

**Examples of exploitable handlers**:

1. `folders:add` (folders.ts:21) -- `path: string` is not validated. While `folder.ts` calls `resolve()` and `existsSync()`, a malicious renderer could pass a non-string value causing unexpected behavior.

2. `settings:save` (settings.ts:24) -- `data: Record<string, unknown>` is merged directly into settings via spread operator with zero schema validation. A malicious payload could inject unexpected keys or override critical settings with wrong types.

3. `export:start` (export.ts:17) -- `options: ExportOptions` accepts `targetPath` which is used directly in file operations. No validation that it's a string, non-empty, or within expected boundaries.

4. `groups:list` (groups.ts:14) -- `options.search` is passed to a SQL `LIKE` query. While Drizzle ORM uses parameterized queries (safe from SQL injection), the search string is not length-limited, allowing potential DoS via extremely long patterns.

**Fix**: Add Zod validation at each IPC handler entry point.

### SEC-05: Unregistered IPC Channel Called from Renderer (A01: Broken Access Control)

**File**: `src/renderer/components/GroupDetail.tsx:165`

```typescript
window.electron.invoke('shell:openPath', masterPhoto.path).catch(() => {})
```

The renderer calls `shell:openPath` but NO handler is registered in the main process for this channel. This is a dead call that silently fails. However, it reveals the intent to call `shell.openPath()` which opens files with the OS default application -- if someone later registers this handler without proper path validation, it becomes an arbitrary file/application launcher.

**Fix**: Either register a secure handler with path validation (ensure the path belongs to a known photo), or remove this call.

---

## MEDIUM

### SEC-06: Export Move Action Deletes Original Without Verification (File System Safety)

**File**: `src/main/services/export.ts:224-225`

```typescript
copyFileSync(file.path, resolvedPath)
if (options.action === 'move') {
  unlinkSync(file.path)
}
```

**Risk**: The move operation copies then deletes the original. However, there is no verification that the copy succeeded (e.g., comparing file sizes or checksums). If `copyFileSync` writes a partial file (e.g., disk full), the original is still deleted, causing data loss.

**Fix**: After `copyFileSync`, verify the destination file exists and matches the expected size before calling `unlinkSync`:

```typescript
if (options.action === 'move') {
  const srcStat = statSync(file.path)
  const dstStat = statSync(resolvedPath)
  if (dstStat.size !== srcStat.size) {
    throw new Error(`Copy verification failed for ${file.filename}`)
  }
  unlinkSync(file.path)
}
```

### SEC-07: No Path Traversal Protection on Export Target (A01: Broken Access Control)

**File**: `src/main/services/export.ts:121-126`

The `targetPath` from `ExportOptions` is used directly without sanitization. Combined with `autoCreateFolder: true`, this allows writing files to any writable location on the filesystem. While this is a desktop app where the user chooses the path, the lack of any boundary check means a compromised renderer (via XSS + SEC-01) could export files to sensitive system directories.

**Fix**: Validate that `targetPath` is under a user-owned directory (e.g., HOME directory) and reject paths containing `..` segments.

### SEC-08: Dependency Vulnerability - esbuild (A06: Vulnerable Components)

**Source**: `npm audit`

```
esbuild <=0.24.2 (moderate)
GHSA-67mh-4wv8-2f99: enables any website to send requests to the dev server
4 moderate severity vulnerabilities (via drizzle-kit -> @esbuild-kit)
```

**Risk**: Moderate. This is a dev-dependency (drizzle-kit) and only affects the development server, not the production build. However, during development, a malicious website in another browser tab could send requests to the dev server and read responses.

**Fix**: Update drizzle-kit when a compatible version is available, or pin esbuild to a patched version.

### SEC-09: Trash moveToTrash Copies But Never Deletes Original (Design Decision - Verify Intent)

**File**: `src/main/services/trash.ts:85-107`

```typescript
// Layer 2: Copy file to trash (NEVER delete original)
copyFileSync(photo.path, destPath)
```

**Status**: This is correctly documented as intentional ("NEVER delete original"). The safety rule is properly implemented. However, this means "trashed" files still consume original disk space. The user may expect that "moving to trash" frees up space, but it actually doubles disk usage until the original is manually removed.

**Recommendation**: Ensure the UI clearly communicates that originals are preserved. Consider adding a separate "remove originals" step after trash confirmation.

---

## LOW

### SEC-10: File Protocol URLs Without Sanitization (A03: Injection)

**Files**: `src/renderer/components/PhotoGrid.tsx:38`, `src/renderer/components/GroupDetail.tsx:53`

```tsx
src={`file://${src}`}
```

Thumbnail paths from the main process are used directly in `file://` URLs. If a malicious path contains special characters or URL-encoded segments, it could potentially cause unexpected behavior. The risk is low because paths come from the trusted main process (not user input directly).

**Fix**: Use proper URL encoding for the path component.

### SEC-11: Dynamic require() Calls (Code Quality)

**Files**: `src/main/services/trash.ts:59`, `src/main/db/index.ts:22`

```typescript
const { app } = require('electron')
```

Both files use dynamic `require('electron')` instead of static imports, wrapped in try/catch for test environment compatibility. While not a direct vulnerability, dynamic requires can complicate static analysis and bundling security checks.

**Fix**: Consider using dependency injection or environment detection at a higher level instead of runtime requires.

### SEC-12: Hardcoded Channel Names Outside IPC Constants (Consistency)

**Files**: `src/main/ipc/handlers/stats.ts:10`, `src/main/ipc/handlers/updater.ts:14,24,29`, `src/main/ipc/handlers/folders.ts:12`

Several handlers use hardcoded string channel names instead of the centralized `IPC` constants from `shared/types.ts`:

- `'stats:get'` (not in IPC constants)
- `'updater:check'`, `'updater:download'`, `'updater:install'` (not in IPC constants)
- `'dialog:openDirectory'` (not in IPC constants)

**Risk**: Makes it harder to maintain a complete channel whitelist and audit IPC surface area.

**Fix**: Add all channels to the `IPC` constant object in `shared/types.ts`.

---

## INFO

### SEC-13: Electron Security Best Practices Compliance

| Setting | Value | Status |
|---------|-------|--------|
| `contextIsolation` | `true` | PASS |
| `nodeIntegration` | `false` | PASS |
| `sandbox` | `false` | FAIL (see SEC-03) |
| `webSecurity` | default (`true`) | PASS |
| CSP | not set | FAIL (see SEC-02) |
| `allowRunningInsecureContent` | not set (default `false`) | PASS |
| `experimentalFeatures` | not set (default `false`) | PASS |

### SEC-14: Secrets Detection - Clean

No hardcoded passwords, API keys, tokens, or AWS credentials found in any source files. `.gitignore` correctly excludes `.env` and `.env.local`. The app uses no cloud services or network APIs (fully local operation as documented).

### SEC-15: SQL Injection - Not Applicable

All database queries use Drizzle ORM with parameterized queries. The one instance of raw SQL (`src/main/db/migrate.ts:14`) is a static DDL string with no user input interpolation. No SQL injection vectors found.

---

## Remediation Priority

| Priority | ID | Fix |
|----------|-----|-----|
| P0 (Immediate) | SEC-01 | Add IPC channel whitelist in preload |
| P0 (Immediate) | SEC-02 | Add Content Security Policy |
| P1 (Before Release) | SEC-03 | Enable sandbox mode |
| P1 (Before Release) | SEC-04 | Add Zod validation for IPC payloads |
| P1 (Before Release) | SEC-05 | Register or remove shell:openPath |
| P2 (Near-term) | SEC-06 | Add copy verification before delete |
| P2 (Near-term) | SEC-07 | Add path boundary validation |
| P3 (Backlog) | SEC-08 | Update esbuild dependency |
| P3 (Backlog) | SEC-12 | Centralize all IPC channel names |
