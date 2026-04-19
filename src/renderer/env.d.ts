/// <reference types="vite/client" />

declare module '*.css' {}

interface Window {
  electron: {
    // Legacy API (Phase 3에서 제거)
    invoke: (channel: string, ...args: unknown[]) => Promise<import('@shared/types').IpcResponse>
    on: (channel: string, callback: (...args: unknown[]) => void) => () => void

    // CQRS API
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
