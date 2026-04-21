import type { CommandBus } from '../commandBus'
import type { QueryBus } from '../queryBus'
import type { EventBus } from '../eventBus'

import { registerFolderHandlers } from './folder'
import { registerScanHandlers } from './scan'
import { registerGroupHandlers } from './group'
import { registerPhotoHandlers } from './photo'
import { registerTrashHandlers } from './trash'
import { registerSettingsHandlers } from './settings'
import { registerStatsHandlers } from './stats'
import { registerMaintenanceHandlers } from './maintenance'
import { registerAppHandlers } from './app'
import { registerUpdaterHandlers } from './updater'
import { registerPluginHandlers } from './plugin'
import { registerNotificationHandlers } from './notification'
import { registerOrganizeHandlers } from './organize'
import { registerAlgorithmHandlers } from './algorithm'

export function registerAllCqrsHandlers(
  cmd: CommandBus,
  qry: QueryBus,
  evt: EventBus
): void {
  registerFolderHandlers(cmd, qry)
  registerScanHandlers(cmd, qry, evt)
  registerGroupHandlers(cmd, qry)
  registerPhotoHandlers(qry)
  registerTrashHandlers(cmd, qry)
  registerSettingsHandlers(cmd, qry)
  registerStatsHandlers(qry)
  registerMaintenanceHandlers(cmd, qry)
  registerAppHandlers(cmd, qry)
  registerUpdaterHandlers(cmd)
  registerPluginHandlers(cmd, qry)
  registerNotificationHandlers(cmd, qry, evt)
  registerOrganizeHandlers(cmd, qry, evt)
  registerAlgorithmHandlers(qry)
}
