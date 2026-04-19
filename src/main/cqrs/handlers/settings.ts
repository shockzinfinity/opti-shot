import { getSettings, saveSettings, resetSettings } from '@main/services/settings'
import type { SettingsSection } from '@main/services/settings'
import type { CommandBus } from '../commandBus'
import type { QueryBus } from '../queryBus'

export function registerSettingsHandlers(cmd: CommandBus, qry: QueryBus): void {
  cmd.register('settings.save', async (input) => {
    return saveSettings(input.section as SettingsSection, input.data)
  })

  cmd.register('settings.reset', async (input) => {
    return resetSettings(input.section as SettingsSection)
  })

  qry.register('settings.get', async (input) => {
    return getSettings(input.section as SettingsSection)
  })
}
