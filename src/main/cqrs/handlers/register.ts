import type { CommandBus } from '../commandBus'
import type { QueryBus } from '../queryBus'
import type { EventBus } from '../eventBus'

import { registerFolderHandlers } from './folder'
import { registerScanHandlers } from './scan'
import { registerGroupHandlers } from './group'
import { registerPhotoHandlers } from './photo'
import { registerExportHandlers } from './export'
import { registerTrashHandlers } from './trash'
import { registerSettingsHandlers } from './settings'
import { registerStatsHandlers } from './stats'
import { registerMaintenanceHandlers } from './maintenance'
import { registerAppHandlers } from './app'
import { registerUpdaterHandlers } from './updater'

export function registerAllCqrsHandlers(
  cmd: CommandBus,
  qry: QueryBus,
  evt: EventBus
): void {
  registerFolderHandlers(cmd, qry)
  registerScanHandlers(cmd, qry, evt)
  registerGroupHandlers(cmd, qry)
  registerPhotoHandlers(qry)
  registerExportHandlers(cmd, evt)
  registerTrashHandlers(cmd, qry)
  registerSettingsHandlers(cmd, qry)
  registerStatsHandlers(qry)
  registerMaintenanceHandlers(cmd, qry)
  registerAppHandlers(cmd, qry)
  registerUpdaterHandlers(cmd)
}
