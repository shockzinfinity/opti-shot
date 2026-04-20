import { dialog } from 'electron'
import { getDb } from '@main/db'
import { addFolder, removeFolder, listFolders, validateFolder } from '@main/services/folder'
import type { CommandBus } from '../commandBus'
import type { QueryBus } from '../queryBus'

export function registerFolderHandlers(cmd: CommandBus, qry: QueryBus): void {
  cmd.register('folder.add', async (input) => {
    const db = getDb()
    return addFolder(db, input.path, input.includeSubfolders)
  })

  cmd.register('folder.remove', async (input) => {
    const db = getDb()
    removeFolder(db, input.id)
  })

  cmd.register('dialog.openDirectory', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled) return null
    return result.filePaths[0]
  })

  qry.register('folder.list', async () => {
    const db = getDb()
    return listFolders(db)
  })

  qry.register('folder.validate', async (input) => {
    return validateFolder(input.path)
  })
}
