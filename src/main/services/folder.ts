// @TASK P2-R1 - Folder management service
// @SPEC specs/domain/resources.yaml#scan_folders
// @TEST tests/main/services/folder.test.ts

import { existsSync, accessSync, statSync, constants } from 'fs'
import { resolve, sep } from 'path'
import { eq } from 'drizzle-orm'
import { scanFolders } from '@main/db/schema'
import type { AppDatabase } from '@main/db'
import crypto from 'crypto'

// --- Types ---

export interface FolderRecord {
  id: string
  path: string
  includeSubfolders: boolean
  isAccessible: boolean
  addedAt: string
}

export interface ValidateResult {
  valid: boolean
  path: string
  reason?: string
}

// --- Service ---

/**
 * Add a folder to scan targets.
 * Validates path existence, checks for duplicates and circular references.
 */
export function addFolder(
  db: AppDatabase,
  folderPath: string,
  includeSubfolders = true,
): FolderRecord {
  const normalizedPath = resolve(folderPath)

  // Layer 1: Validate path exists and is accessible
  if (!existsSync(normalizedPath)) {
    throw new Error(`Path does not exist: ${normalizedPath}`)
  }

  try {
    accessSync(normalizedPath, constants.R_OK)
  } catch {
    throw new Error(`Path is not readable: ${normalizedPath}`)
  }

  const stat = statSync(normalizedPath)
  if (!stat.isDirectory()) {
    throw new Error(`Path is not a directory: ${normalizedPath}`)
  }

  // Layer 2: Check for duplicates
  const existing = db.select().from(scanFolders).all()

  for (const folder of existing) {
    const existingPath = resolve(folder.path)

    // Exact duplicate
    if (existingPath === normalizedPath) {
      throw new Error(`Path is already registered: ${normalizedPath}`)
    }

    // Child of existing parent (circular reference)
    if (normalizedPath.startsWith(existingPath + sep)) {
      throw new Error(
        `Path "${normalizedPath}" is already covered by registered folder "${existingPath}"`,
      )
    }

    // Parent of existing child (circular reference)
    if (existingPath.startsWith(normalizedPath + sep)) {
      throw new Error(
        `Path "${normalizedPath}" contains already registered folder "${existingPath}"`,
      )
    }
  }

  // Insert to DB
  const record: FolderRecord = {
    id: crypto.randomUUID(),
    path: normalizedPath,
    includeSubfolders,
    isAccessible: true,
    addedAt: new Date().toISOString(),
  }

  db.insert(scanFolders).values({
    id: record.id,
    path: record.path,
    includeSubfolders: record.includeSubfolders,
    isAccessible: record.isAccessible,
    addedAt: record.addedAt,
  }).run()

  return record
}

/**
 * Remove a folder from scan targets by ID.
 */
export function removeFolder(db: AppDatabase, id: string): void {
  const existing = db.select().from(scanFolders).where(eq(scanFolders.id, id)).get()

  if (!existing) {
    throw new Error(`Folder not found: ${id}`)
  }

  db.delete(scanFolders).where(eq(scanFolders.id, id)).run()
}

/**
 * List all registered scan folders.
 */
export function listFolders(db: AppDatabase): FolderRecord[] {
  const rows = db.select().from(scanFolders).all()

  return rows.map((row) => ({
    id: row.id,
    path: row.path,
    includeSubfolders: row.includeSubfolders,
    isAccessible: row.isAccessible,
    addedAt: row.addedAt,
  }))
}

/**
 * Validate whether a path is a valid, accessible directory.
 */
export function validateFolder(folderPath: string): ValidateResult {
  const normalizedPath = resolve(folderPath)

  if (!existsSync(normalizedPath)) {
    return { valid: false, path: normalizedPath, reason: 'Path does not exist' }
  }

  try {
    accessSync(normalizedPath, constants.R_OK)
  } catch {
    return { valid: false, path: normalizedPath, reason: 'Path is not readable' }
  }

  const stat = statSync(normalizedPath)
  if (!stat.isDirectory()) {
    return { valid: false, path: normalizedPath, reason: 'Path is not a directory' }
  }

  return { valid: true, path: normalizedPath }
}
