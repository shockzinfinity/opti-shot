import { CommandBus } from './commandBus'
import { QueryBus } from './queryBus'
import { EventBus } from './eventBus'
import { registerCqrsBridge } from './ipcBridge'
import { registerAllCqrsHandlers } from './handlers/register'
import { applyNotificationMiddleware } from './notificationMiddleware'
import { pluginRegistry } from '@main/engine/plugin-registry'
import { phashSsimPlugin } from '@main/engine/plugins/phash-ssim'
import { algorithmRegistry } from '@main/engine/algorithm-registry'
import { phashAlgorithm } from '@main/engine/algorithms/phash'
import { ssimAlgorithm } from '@main/engine/algorithms/ssim'
import { getSettings } from '@main/services/settings'

// Singleton instances
let commandBus: CommandBus
let queryBus: QueryBus
let eventBus: EventBus

export function initCqrs(): void {
  commandBus = new CommandBus()
  queryBus = new QueryBus()
  eventBus = new EventBus()

  // Register built-in detection plugins (legacy — to be removed after Step 4)
  pluginRegistry.register(phashSsimPlugin)

  // Register algorithms (new architecture)
  algorithmRegistry.registerHash(phashAlgorithm)
  algorithmRegistry.registerVerify(ssimAlgorithm)

  // Restore plugin enabled state from settings
  const scanSettings = getSettings('scan')
  if (scanSettings.enabledPlugins) {
    pluginRegistry.loadState(scanSettings.enabledPlugins)
  }

  // Register all handlers on the buses
  registerAllCqrsHandlers(commandBus, queryBus, eventBus)

  // Apply notification middleware (intercepts command results/errors)
  applyNotificationMiddleware(commandBus)

  // Bridge buses to IPC (cqrs:cmd, cqrs:qry channels)
  registerCqrsBridge(commandBus, queryBus)
}

export function getCommandBus(): CommandBus { return commandBus }
export function getQueryBus(): QueryBus { return queryBus }
export function getEventBus(): EventBus { return eventBus }
