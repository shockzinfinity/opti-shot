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
