import { z, type ZodSchema } from 'zod'

// String ID validator
const stringId = z.string().min(1)
const section = z.enum(['scan', 'ui', 'data'])

// Command schemas — type → Zod mapping
export const COMMAND_SCHEMAS: Record<string, ZodSchema> = {
  'folder.add': z.object({
    path: z.string().min(1),
    includeSubfolders: z.boolean().optional().default(true),
  }),
  'folder.remove': z.object({ id: stringId }),

  'scan.start': z.object({
    mode: z.enum(['full', 'date_range', 'folder_only', 'incremental']),
    phashThreshold: z.number().min(4).max(16),
    ssimThreshold: z.number().min(0.5).max(0.95),
    timeWindowHours: z.number().min(0).max(24),
    parallelThreads: z.number().min(1).max(16),
    batchSize: z.number().optional(),
  }),

  'group.changeMaster': z.object({
    groupId: stringId,
    newMasterId: stringId,
  }),
  'group.markReviewed': z.object({
    groupId: stringId,
    decision: z.enum(['kept_all', 'duplicates_deleted']).optional(),
  }),

  'export.start': z.object({
    targetPath: z.string().min(1),
    action: z.enum(['copy', 'move']),
    conflictStrategy: z.enum(['skip', 'rename', 'overwrite']),
    autoCreateFolder: z.boolean(),
  }),

  'trash.move': z.object({ photoId: stringId }),
  'trash.restore': z.object({ trashId: stringId }),
  'trash.restoreGroup': z.object({ groupId: stringId }),
  'trash.delete': z.object({ trashId: stringId }),

  'plugin.toggle': z.object({
    pluginId: z.string().min(1),
    enabled: z.boolean(),
  }),

  'settings.save': z.object({
    section,
    data: z.record(z.string(), z.unknown()),
  }),
  'settings.reset': z.object({ section }),

  'shell.openPath': z.object({
    filePath: z.string().min(1),
  }),
}

// Query schemas — type → Zod mapping
export const QUERY_SCHEMAS: Record<string, ZodSchema> = {
  'folder.validate': z.object({ path: z.string().min(1) }),

  'group.list': z.object({
    offset: z.number().optional(),
    limit: z.number().optional(),
    search: z.string().optional(),
    status: z.string().optional(),
  }).optional().default({}),

  'group.detail': z.object({ groupId: stringId }),
  'photo.info': z.object({ photoId: stringId }),
  'photo.thumbnail': z.object({ photoId: stringId }),
  'photo.exif': z.object({ photoId: stringId }),

  'trash.list': z.object({
    offset: z.number().optional(),
    limit: z.number().optional(),
  }).optional().default({}),

  'settings.get': z.object({ section }),
}
