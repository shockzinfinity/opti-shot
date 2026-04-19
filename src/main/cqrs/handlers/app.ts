import { app, shell } from 'electron'
import { existsSync } from 'fs'
import type { CommandBus } from '../commandBus'
import type { QueryBus } from '../queryBus'

export function registerAppHandlers(cmd: CommandBus, qry: QueryBus): void {
  cmd.register('shell.openPath', async (input) => {
    if (!existsSync(input.filePath)) throw new Error('File not found')
    const result = await shell.openPath(input.filePath)
    if (result) throw new Error(result)
  })

  qry.register('app.info', async () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
    platform: `${process.platform} ${process.arch}`,
  }))
}
