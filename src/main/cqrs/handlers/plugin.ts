import { pluginRegistry } from '@main/engine/plugin-registry'
import { saveSettings, getSettings } from '@main/services/settings'
import type { CommandBus } from '../commandBus'
import type { QueryBus } from '../queryBus'

export function registerPluginHandlers(cmd: CommandBus, qry: QueryBus): void {
  qry.register('plugin.list', async () => {
    return pluginRegistry.list()
  })

  cmd.register('plugin.toggle', async (input: { pluginId: string; enabled: boolean }) => {
    pluginRegistry.setEnabled(input.pluginId, input.enabled)

    // Persist to settings
    const scan = getSettings('scan')
    scan.enabledPlugins = {
      ...scan.enabledPlugins,
      [input.pluginId]: input.enabled,
    }
    saveSettings('scan', { enabledPlugins: scan.enabledPlugins })
  })
}
