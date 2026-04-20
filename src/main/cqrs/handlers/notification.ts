import type { CommandBus } from '../commandBus'
import type { QueryBus } from '../queryBus'
import type { EventBus } from '../eventBus'
import {
  initNotificationSession,
  setNotificationEmitter,
  listNotifications,
  markNotificationsRead,
  clearNotificationState,
} from '@main/services/notification'

export function registerNotificationHandlers(
  cmd: CommandBus,
  qry: QueryBus,
  evt: EventBus,
): void {
  // Clear previous session's notifications
  initNotificationSession()

  // Wire up EventBus emitter so sendNotification() can push to Renderer
  setNotificationEmitter((entry) => {
    evt.publish('notification.new', entry)
  })

  qry.register('notification.list', async (input: { limit?: number }) => {
    return listNotifications(input?.limit ?? 50)
  })

  cmd.register('notification.markRead', async (input: { ids: string[] }) => {
    markNotificationsRead(input.ids)
  })

  cmd.register('notification.clear', async () => {
    clearNotificationState()
  })
}
