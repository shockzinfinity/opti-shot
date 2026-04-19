import { ipcMain } from 'electron'
import type { CommandBus } from './commandBus'
import type { QueryBus } from './queryBus'
import { COMMAND_SCHEMAS, QUERY_SCHEMAS } from './schemas'

export function registerCqrsBridge(
  commandBus: CommandBus,
  queryBus: QueryBus
): void {
  ipcMain.handle('cqrs:cmd', async (_event, type: string, payload: unknown) => {
    // 1. Main-side allowlist
    if (!commandBus.has(type)) {
      return { success: false, error: `Unknown command: ${type}` }
    }

    // 2. Zod validation (if schema exists)
    const schema = COMMAND_SCHEMAS[type]
    if (schema) {
      const parsed = schema.safeParse(payload)
      if (!parsed.success) {
        return { success: false, error: `Invalid payload: ${parsed.error.issues.map(i => i.message).join(', ')}` }
      }
      payload = parsed.data
    }

    // 3. Execute
    try {
      const result = await commandBus.execute(type, payload)
      return { success: true, data: result ?? null }
    } catch (err) {
      console.error(`Command [${type}] failed:`, err)
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('cqrs:qry', async (_event, type: string, payload: unknown) => {
    if (!queryBus.has(type)) {
      return { success: false, error: `Unknown query: ${type}` }
    }

    const schema = QUERY_SCHEMAS[type]
    if (schema) {
      const parsed = schema.safeParse(payload)
      if (!parsed.success) {
        return { success: false, error: `Invalid payload: ${parsed.error.issues.map(i => i.message).join(', ')}` }
      }
      payload = parsed.data
    }

    try {
      const result = await queryBus.execute(type, payload)
      return { success: true, data: result ?? null }
    } catch (err) {
      console.error(`Query [${type}] failed:`, err)
      return { success: false, error: (err as Error).message }
    }
  })
}
