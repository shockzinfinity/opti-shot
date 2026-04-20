// @TASK P0-T0.2 - Drizzle ORM Schema for all domain entities
// @SPEC specs/domain/resources.yaml

import { sqliteTable, index } from 'drizzle-orm/sqlite-core'
import { text, integer, real } from 'drizzle-orm/sqlite-core'

// ─── Scan Folders ───

export const scanFolders = sqliteTable('scan_folders', {
  id: text('id').primaryKey(), // UUID
  path: text('path').notNull(),
  includeSubfolders: integer('include_subfolders', { mode: 'boolean' }).notNull().default(true),
  isAccessible: integer('is_accessible', { mode: 'boolean' }).notNull().default(true),
  addedAt: text('added_at').notNull(), // ISO datetime
})

// ─── Scans ───

export const scans = sqliteTable('scans', {
  id: text('id').primaryKey(), // UUID
  status: text('status', {
    enum: ['running', 'paused', 'completed', 'failed', 'cancelled'],
  }).notNull().default('running'),
  progressPercent: real('progress_percent').notNull().default(0),
  totalFiles: integer('total_files').notNull().default(0),
  processedFiles: integer('processed_files').notNull().default(0),
  discoveredGroups: integer('discovered_groups').notNull().default(0),
  elapsedSeconds: real('elapsed_seconds').notNull().default(0),
  estimatedRemainingSeconds: real('estimated_remaining_seconds').notNull().default(0),
  scanSpeed: real('scan_speed').notNull().default(0), // files_per_hour
  currentFile: text('current_file').notNull().default(''),
  errorMessage: text('error_message'),
  skippedFiles: integer('skipped_files').notNull().default(0),

  // scan_options embedded
  optionMode: text('option_mode', {
    enum: ['full', 'date_range', 'folder_only', 'incremental'],
  }).notNull().default('full'),
  optionDateStart: text('option_date_start'), // ISO date, nullable
  optionDateEnd: text('option_date_end'),     // ISO date, nullable
  optionPhashThreshold: integer('option_phash_threshold').notNull().default(8),
  optionSsimThreshold: real('option_ssim_threshold').notNull().default(0.82),
  optionTimeWindowHours: integer('option_time_window_hours').notNull().default(1),
  optionParallelThreads: integer('option_parallel_threads').notNull().default(8),
  optionEnableCorrectionDetection: integer('option_enable_correction_detection', { mode: 'boolean' }).notNull().default(true),
  optionEnableExifFilter: integer('option_enable_exif_filter', { mode: 'boolean' }).notNull().default(false),
  filteredFiles: integer('filtered_files').notNull().default(0),

  startedAt: text('started_at').notNull(),  // ISO datetime
  endedAt: text('ended_at'),                // ISO datetime, nullable
}, (t) => [
  index('idx_scans_status').on(t.status),
])

// ─── Photo Groups ───
// Note: masterId has circular ref to photos. Declared as nullable text;
// application layer enforces referential integrity.

export const photoGroups = sqliteTable('photo_groups', {
  id: text('id').primaryKey(), // UUID
  fileCount: integer('file_count').notNull().default(0),
  totalSize: integer('total_size').notNull().default(0),     // bytes
  reclaimableSize: integer('reclaimable_size').notNull().default(0), // bytes
  masterId: text('master_id'), // UUID, nullable — circular ref to photos
  reviewStatus: text('review_status', {
    enum: ['pending', 'reviewed', 'exported'],
  }).notNull().default('pending'),
  reviewedAt: text('reviewed_at'), // ISO datetime, nullable
  decision: text('decision', {
    enum: ['kept_all', 'duplicates_deleted'],
  }), // nullable — null means pending/undecided
  decidedAt: text('decided_at'), // ISO datetime, nullable
})

// ─── Photos ───

export const photos = sqliteTable('photos', {
  id: text('id').primaryKey(), // UUID
  filename: text('filename').notNull(),
  path: text('path').notNull(),
  fileSize: integer('file_size').notNull().default(0),   // bytes
  width: integer('width').notNull().default(0),
  height: integer('height').notNull().default(0),
  qualityScore: real('quality_score').notNull().default(0), // 0-100
  takenAt: text('taken_at'),            // ISO datetime, nullable
  cameraModel: text('camera_model'),    // nullable
  lensModel: text('lens_model'),        // nullable
  iso: integer('iso'),                   // nullable
  shutterSpeed: text('shutter_speed'),   // nullable, e.g. "1/60s"
  aperture: real('aperture'),            // nullable, e.g. 1.8
  focalLength: real('focal_length'),     // nullable, e.g. 3.0 (mm)
  latitude: real('latitude'),              // nullable, GPS
  longitude: real('longitude'),            // nullable, GPS
  phash: text('phash').notNull(),
  isMaster: integer('is_master', { mode: 'boolean' }).notNull().default(false),
  groupId: text('group_id').notNull().references(() => photoGroups.id, { onDelete: 'cascade' }),
  thumbnailPath: text('thumbnail_path').notNull().default(''),
}, (t) => [
  index('idx_photos_phash').on(t.phash),
  index('idx_photos_group_id').on(t.groupId),
])

// ─── Export Jobs ───

export const exportJobs = sqliteTable('export_jobs', {
  id: text('id').primaryKey(), // UUID
  status: text('status', {
    enum: ['ready', 'running', 'paused', 'completed', 'failed'],
  }).notNull().default('ready'),
  action: text('action', {
    enum: ['copy', 'move'],
  }).notNull(),
  targetPath: text('target_path').notNull(),
  totalFiles: integer('total_files').notNull().default(0),
  processedFiles: integer('processed_files').notNull().default(0),
  totalSize: integer('total_size').notNull().default(0),       // bytes
  transferredSize: integer('transferred_size').notNull().default(0), // bytes
  transferSpeed: real('transfer_speed').notNull().default(0),  // bytes_per_sec
  conflictStrategy: text('conflict_strategy', {
    enum: ['skip', 'rename', 'overwrite'],
  }).notNull().default('skip'),
  autoCreateFolder: integer('auto_create_folder', { mode: 'boolean' }).notNull().default(true),
  failedCount: integer('failed_count').notNull().default(0),
  elapsedSeconds: real('elapsed_seconds').notNull().default(0),
  estimatedRemainingSeconds: real('estimated_remaining_seconds').notNull().default(0),
})

// ─── Export Items ───

export const exportItems = sqliteTable('export_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  exportId: text('export_id').notNull().references(() => exportJobs.id, { onDelete: 'cascade' }),
  photoId: text('photo_id').notNull().references(() => photos.id, { onDelete: 'cascade' }),
  groupId: text('group_id').notNull().references(() => photoGroups.id, { onDelete: 'cascade' }),
})

// ─── Trash Items ───

export const trashItems = sqliteTable('trash_items', {
  id: text('id').primaryKey(), // UUID
  photoId: text('photo_id').notNull().references(() => photos.id),
  originalPath: text('original_path').notNull(),
  filename: text('filename').notNull(),
  fileSize: integer('file_size').notNull().default(0), // bytes
  status: text('status', {
    enum: ['trashed', 'restored', 'purged'],
  }).notNull().default('trashed'),
  deletedAt: text('deleted_at').notNull(),  // ISO datetime
  expiresAt: text('expires_at').notNull(),  // ISO datetime
  restoredAt: text('restored_at'),          // ISO datetime, nullable
}, (t) => [
  index('idx_trash_items_status').on(t.status),
])

// ─── Settings (key-value store for singleton settings) ───

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(), // JSON-serialized
  updatedAt: text('updated_at').notNull(), // ISO datetime
})
