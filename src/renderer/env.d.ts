/// <reference types="vite/client" />

declare module '*.css' {}

interface Window {
  electron: {
    invoke: (channel: string, ...args: unknown[]) => Promise<import('@shared/types').IpcResponse>
    on: (channel: string, callback: (...args: unknown[]) => void) => () => void
  }
}
