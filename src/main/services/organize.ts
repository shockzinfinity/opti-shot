import { readdirSync, statSync, renameSync, existsSync } from 'fs'
import { join, extname, basename, dirname } from 'path'
import { randomUUID } from 'crypto'
import exifr from 'exifr'
import { eq } from 'drizzle-orm'
import type { AppDatabase } from '@main/db'
import { organizeJobs, organizeRenames } from '@main/db/schema'
import { IMAGE_EXTENSIONS } from '@shared/constants'
import type { OrganizeDateSource, OrganizePreviewItem } from '@shared/types'

// --- File collection ---

export function collectFiles(folder: string, includeSubfolders: boolean): string[] {
  const files: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory() && includeSubfolders) {
        walk(full)
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase()
        if (IMAGE_EXTENSIONS.has(ext)) {
          files.push(full)
        }
      }
    }
  }
  walk(folder)
  return files
}

// --- Date extraction ---

async function extractDate(filePath: string): Promise<{ date: Date; source: OrganizeDateSource }> {
  try {
    const exif = await exifr.parse(filePath, ['DateTimeOriginal', 'CreateDate'])
    if (exif?.DateTimeOriginal instanceof Date) {
      return { date: exif.DateTimeOriginal, source: 'exif' }
    }
    if (exif?.CreateDate instanceof Date) {
      return { date: exif.CreateDate, source: 'exif' }
    }
  } catch {
    // EXIF parse failed — fallback to file stats
  }

  const stat = statSync(filePath)
  const fileDate = stat.birthtime.getTime() > 0 ? stat.birthtime : stat.mtime
  return { date: fileDate, source: 'file' }
}

// --- Name generation ---

function pad2(n: number): string { return n.toString().padStart(2, '0') }
function pad3(n: number): string { return n.toString().padStart(3, '0') }

function formatDateName(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}_${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`
}

// --- Preview (2-pass: collect dates → assign names, seq only on collision) ---

interface FileEntry {
  filePath: string
  dir: string
  ext: string
  dateName: string
  dateSource: OrganizeDateSource
}

export async function previewOrganize(
  folder: string,
  includeSubfolders: boolean,
  onProgress?: (processed: number, total: number, file: string) => void,
): Promise<{ items: OrganizePreviewItem[]; totalFiles: number; renamedCount: number; skippedCount: number }> {
  const files = collectFiles(folder, includeSubfolders)
  const items: OrganizePreviewItem[] = []
  let skipped = 0

  // Pass 1: extract dates for all files
  const entries: FileEntry[] = []
  for (let i = 0; i < files.length; i++) {
    const filePath = files[i]
    onProgress?.(i + 1, files.length, basename(filePath))

    const { date, source } = await extractDate(filePath)
    entries.push({
      filePath,
      dir: dirname(filePath),
      ext: extname(filePath),
      dateName: formatDateName(date),
      dateSource: source,
    })
  }

  // Count collisions per dir+dateName+ext
  const keyCount = new Map<string, number>()
  for (const e of entries) {
    const key = `${e.dir}|${e.dateName}|${e.ext.toLowerCase()}`
    keyCount.set(key, (keyCount.get(key) ?? 0) + 1)
  }

  // Pass 2: assign names — seq only when collisions exist
  const seqCounters = new Map<string, number>()
  const usedPaths = new Set<string>()

  for (const e of entries) {
    const key = `${e.dir}|${e.dateName}|${e.ext.toLowerCase()}`
    const hasCollision = (keyCount.get(key) ?? 0) > 1

    let newPath: string
    if (hasCollision) {
      const seq = (seqCounters.get(key) ?? 0) + 1
      seqCounters.set(key, seq)
      newPath = join(e.dir, `${e.dateName}_${pad3(seq)}${e.ext}`)
    } else {
      newPath = join(e.dir, `${e.dateName}${e.ext}`)
    }

    // Handle collision with existing files on disk
    while (usedPaths.has(newPath) || (existsSync(newPath) && newPath !== e.filePath)) {
      const seq = (seqCounters.get(key) ?? 0) + 1
      seqCounters.set(key, seq)
      newPath = join(e.dir, `${e.dateName}_${pad3(seq)}${e.ext}`)
    }
    usedPaths.add(newPath)

    if (newPath === e.filePath) {
      skipped++
      continue
    }

    items.push({
      originalPath: e.filePath,
      renamedPath: newPath,
      dateSource: e.dateSource,
    })
  }

  return {
    items,
    totalFiles: files.length,
    renamedCount: items.length,
    skippedCount: skipped,
  }
}

// --- Execute ---

export async function executeOrganize(
  db: AppDatabase,
  folder: string,
  includeSubfolders: boolean,
  onProgress?: (processed: number, total: number, file: string) => void,
): Promise<{ jobId: string; renamedFiles: number; skippedFiles: number; totalFiles: number }> {
  const preview = await previewOrganize(folder, includeSubfolders, onProgress)
  const jobId = randomUUID()
  const now = new Date().toISOString()

  // Delete previous job (keep only 1)
  const existing = db.select().from(organizeJobs).all()
  for (const job of existing) {
    db.delete(organizeRenames).where(eq(organizeRenames.jobId, job.id)).run()
    db.delete(organizeJobs).where(eq(organizeJobs.id, job.id)).run()
  }

  // Execute renames
  const successRenames: Array<{ id: string; originalPath: string; renamedPath: string; dateSource: OrganizeDateSource }> = []

  for (const item of preview.items) {
    try {
      renameSync(item.originalPath, item.renamedPath)
      successRenames.push({
        id: randomUUID(),
        originalPath: item.originalPath,
        renamedPath: item.renamedPath,
        dateSource: item.dateSource,
      })
    } catch (err) {
      console.error(`Failed to rename ${item.originalPath}:`, err)
    }
  }

  // Save job + renames to DB
  db.insert(organizeJobs).values({
    id: jobId,
    folder,
    includeSubfolders,
    totalFiles: preview.totalFiles,
    renamedFiles: successRenames.length,
    skippedFiles: preview.totalFiles - successRenames.length,
    status: 'completed',
    startedAt: now,
    endedAt: new Date().toISOString(),
  }).run()

  for (const rename of successRenames) {
    db.insert(organizeRenames).values({
      id: rename.id,
      jobId,
      originalPath: rename.originalPath,
      renamedPath: rename.renamedPath,
      dateSource: rename.dateSource,
    }).run()
  }

  return {
    jobId,
    renamedFiles: successRenames.length,
    skippedFiles: preview.totalFiles - successRenames.length,
    totalFiles: preview.totalFiles,
  }
}

// --- Undo ---

export function undoOrganize(
  db: AppDatabase,
  jobId: string,
): { restoredCount: number } {
  const renames = db.select().from(organizeRenames).where(eq(organizeRenames.jobId, jobId)).all()
  let restored = 0

  for (const rename of renames) {
    try {
      if (existsSync(rename.renamedPath)) {
        renameSync(rename.renamedPath, rename.originalPath)
        restored++
      }
    } catch (err) {
      console.error(`Failed to undo rename ${rename.renamedPath}:`, err)
    }
  }

  db.update(organizeJobs)
    .set({ status: 'undone' })
    .where(eq(organizeJobs.id, jobId))
    .run()

  return { restoredCount: restored }
}

// --- Query ---

export function getLastOrganizeJob(db: AppDatabase) {
  const jobs = db.select().from(organizeJobs).all()
  if (jobs.length === 0) return null
  return jobs[0]
}
