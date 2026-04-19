// @TASK P2-R3, P5-R1 - Central IPC handler registration
// @SPEC CLAUDE.md#Project-Structure

import { registerSettingsHandlers } from './handlers/settings'
import { registerFolderHandlers } from './handlers/folders'
import { registerScanHandlers } from './handlers/scan'
import { registerStatsHandlers } from './handlers/stats'
import { registerGroupHandlers } from './handlers/groups'
import { registerPhotoAndReviewHandlers } from './handlers/reviews'
import { registerExportHandlers } from './handlers/export'
import { registerTrashHandlers } from './handlers/trash'
import { registerUpdaterHandlers } from './handlers/updater'
import { registerAppInfoHandlers } from './handlers/appInfo'
import { registerMaintenanceHandlers } from './handlers/maintenance'

/**
 * Register all IPC handlers for the main process.
 * Called once during app.whenReady().
 */
export function registerAllHandlers(): void {
  registerSettingsHandlers()
  registerFolderHandlers()
  registerScanHandlers()
  registerStatsHandlers()
  registerGroupHandlers()
  registerPhotoAndReviewHandlers()
  registerExportHandlers()
  registerTrashHandlers()
  registerUpdaterHandlers()
  registerAppInfoHandlers()
  registerMaintenanceHandlers()
}
