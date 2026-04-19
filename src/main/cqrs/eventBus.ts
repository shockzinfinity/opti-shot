import { BrowserWindow } from 'electron'
import type { EventType, EventPayload } from '@shared/cqrs'

export class EventBus {
  publish<K extends EventType>(type: K, payload: EventPayload<K>): void {
    const channel = `cqrs:evt:${type}`
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, payload)
      }
    }
  }
}
