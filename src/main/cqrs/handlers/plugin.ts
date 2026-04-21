import { pluginRegistry } from '@main/engine/plugin-registry'
import type { CommandBus } from '../commandBus'
import type { QueryBus } from '../queryBus'

export function registerPluginHandlers(cmd: CommandBus, qry: QueryBus): void {
  qry.register('plugin.list', async () => {
    return pluginRegistry.list()
  })

  cmd.register('plugin.toggle', async (input: { pluginId: string; enabled: boolean }) => {
    // Toggle legacy plugin registry (backward compat — no longer persisted to settings)
    pluginRegistry.setEnabled(input.pluginId, input.enabled)
  })
}
