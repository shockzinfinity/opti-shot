import { CommandBus } from './commandBus'
import { QueryBus } from './queryBus'
import { EventBus } from './eventBus'
import { registerCqrsBridge } from './ipcBridge'
import { registerAllCqrsHandlers } from './handlers/register'
import { applyNotificationMiddleware } from './notificationMiddleware'
import { algorithmRegistry } from '@main/engine/algorithm-registry'
import { phashAlgorithm } from '@main/engine/algorithms/phash'
import { dhashAlgorithm } from '@main/engine/algorithms/dhash'
import { ssimAlgorithm } from '@main/engine/algorithms/ssim'
import { nmseAlgorithm } from '@main/engine/algorithms/nmse'
// Singleton instances
let commandBus: CommandBus
let queryBus: QueryBus
let eventBus: EventBus

export function initCqrs(): void {
  commandBus = new CommandBus()
  queryBus = new QueryBus()
  eventBus = new EventBus()

  // Register algorithms
  algorithmRegistry.registerHash(phashAlgorithm)
  algorithmRegistry.registerHash(dhashAlgorithm)
  algorithmRegistry.registerVerify(ssimAlgorithm)
  algorithmRegistry.registerVerify(nmseAlgorithm)

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
