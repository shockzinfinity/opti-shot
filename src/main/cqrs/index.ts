import { CommandBus } from './commandBus'
import { QueryBus } from './queryBus'
import { EventBus } from './eventBus'
import { registerCqrsBridge } from './ipcBridge'
import { registerAllCqrsHandlers } from './handlers/register'

// Singleton instances
let commandBus: CommandBus
let queryBus: QueryBus
let eventBus: EventBus

export function initCqrs(): void {
  commandBus = new CommandBus()
  queryBus = new QueryBus()
  eventBus = new EventBus()

  // Register all handlers on the buses
  registerAllCqrsHandlers(commandBus, queryBus, eventBus)

  // Bridge buses to IPC (cqrs:cmd, cqrs:qry channels)
  registerCqrsBridge(commandBus, queryBus)
}

export function getCommandBus(): CommandBus { return commandBus }
export function getQueryBus(): QueryBus { return queryBus }
export function getEventBus(): EventBus { return eventBus }
