// @SECURITY A03 - IPC payload validation with Zod
// Validates all incoming IPC payloads to prevent injection and malformed data

import { z } from 'zod'

export const folderAddSchema = z.object({
  path: z.string().min(1),
  includeSubfolders: z.boolean().optional().default(true),
})

export const scanStartSchema = z.object({
  mode: z.enum(['full', 'date_range', 'folder_only', 'incremental']),
  phashThreshold: z.number().min(4).max(16),
  ssimThreshold: z.number().min(0.5).max(0.95),
  timeWindowHours: z.number().min(0).max(24),
  parallelThreads: z.number().min(1).max(16),
  batchSize: z.number().optional(),
})

export const exportStartSchema = z.object({
  targetPath: z.string().min(1),
  action: z.enum(['copy', 'move']),
  conflictStrategy: z.enum(['skip', 'rename', 'overwrite']),
  autoCreateFolder: z.boolean(),
})

export const settingsSaveSchema = z.object({
  section: z.enum(['scan', 'ui', 'data']),
})

export const groupChangeMasterSchema = z.object({
  groupId: z.string().uuid(),
  photoId: z.string().uuid(),
})

export const reviewSetSchema = z.object({
  groupId: z.string().uuid(),
  photoId: z.string().uuid(),
  decision: z.enum(['keep', 'delete']),
})

/**
 * Validate that an argument is a non-empty string.
 * Used for simple ID parameters across handlers.
 */
export function validateStringId(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Invalid ID: expected non-empty string')
  }
  return value
}
