// @TASK P0-T0.2 - Database migration: create all tables if not exist
// @SPEC specs/domain/resources.yaml

import type { AppDatabase } from './index'

/**
 * Create all tables if they do not already exist.
 * Uses raw SQL DDL since drizzle-kit push requires CLI tooling.
 * This is the runtime migration strategy for Electron apps.
 */
export function migrate(db: AppDatabase): void {
  const sqlite = db.$client

  sqlite.exec(`
    -- Scan Folders
    CREATE TABLE IF NOT EXISTS scan_folders (
      id TEXT PRIMARY KEY NOT NULL,
      path TEXT NOT NULL,
      include_subfolders INTEGER NOT NULL DEFAULT 1,
      is_accessible INTEGER NOT NULL DEFAULT 1,
      added_at TEXT NOT NULL
    );

    -- Scans
    CREATE TABLE IF NOT EXISTS scans (
      id TEXT PRIMARY KEY NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      progress_percent REAL NOT NULL DEFAULT 0,
      total_files INTEGER NOT NULL DEFAULT 0,
      processed_files INTEGER NOT NULL DEFAULT 0,
      discovered_groups INTEGER NOT NULL DEFAULT 0,
      elapsed_seconds REAL NOT NULL DEFAULT 0,
      estimated_remaining_seconds REAL NOT NULL DEFAULT 0,
      scan_speed REAL NOT NULL DEFAULT 0,
      current_file TEXT NOT NULL DEFAULT '',
      error_message TEXT,
      option_mode TEXT NOT NULL DEFAULT 'full',
      option_date_start TEXT,
      option_date_end TEXT,
      option_phash_threshold INTEGER NOT NULL DEFAULT 8,
      option_ssim_threshold REAL NOT NULL DEFAULT 0.82,
      option_time_window_hours INTEGER NOT NULL DEFAULT 1,
      option_parallel_threads INTEGER NOT NULL DEFAULT 8,
      option_enable_correction_detection INTEGER NOT NULL DEFAULT 1,
      started_at TEXT NOT NULL,
      ended_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_scans_status ON scans(status);

    -- Photo Groups
    CREATE TABLE IF NOT EXISTS photo_groups (
      id TEXT PRIMARY KEY NOT NULL,
      file_count INTEGER NOT NULL DEFAULT 0,
      total_size INTEGER NOT NULL DEFAULT 0,
      reclaimable_size INTEGER NOT NULL DEFAULT 0,
      master_id TEXT,
      review_status TEXT NOT NULL DEFAULT 'pending',
      reviewed_at TEXT
    );

    -- Photos
    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY NOT NULL,
      filename TEXT NOT NULL,
      path TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      width INTEGER NOT NULL DEFAULT 0,
      height INTEGER NOT NULL DEFAULT 0,
      quality_score REAL NOT NULL DEFAULT 0,
      taken_at TEXT,
      camera_model TEXT,
      lens_model TEXT,
      iso INTEGER,
      shutter_speed TEXT,
      aperture REAL,
      focal_length REAL,
      phash TEXT NOT NULL,
      is_master INTEGER NOT NULL DEFAULT 0,
      group_id TEXT NOT NULL REFERENCES photo_groups(id) ON DELETE CASCADE,
      thumbnail_path TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_photos_phash ON photos(phash);
    CREATE INDEX IF NOT EXISTS idx_photos_group_id ON photos(group_id);

    -- Export Jobs
    CREATE TABLE IF NOT EXISTS export_jobs (
      id TEXT PRIMARY KEY NOT NULL,
      status TEXT NOT NULL DEFAULT 'ready',
      action TEXT NOT NULL,
      target_path TEXT NOT NULL,
      total_files INTEGER NOT NULL DEFAULT 0,
      processed_files INTEGER NOT NULL DEFAULT 0,
      total_size INTEGER NOT NULL DEFAULT 0,
      transferred_size INTEGER NOT NULL DEFAULT 0,
      transfer_speed REAL NOT NULL DEFAULT 0,
      conflict_strategy TEXT NOT NULL DEFAULT 'skip',
      auto_create_folder INTEGER NOT NULL DEFAULT 1,
      failed_count INTEGER NOT NULL DEFAULT 0,
      elapsed_seconds REAL NOT NULL DEFAULT 0,
      estimated_remaining_seconds REAL NOT NULL DEFAULT 0
    );

    -- Export Items
    CREATE TABLE IF NOT EXISTS export_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      export_id TEXT NOT NULL REFERENCES export_jobs(id) ON DELETE CASCADE,
      photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
      group_id TEXT NOT NULL REFERENCES photo_groups(id) ON DELETE CASCADE
    );

    -- Trash Items
    CREATE TABLE IF NOT EXISTS trash_items (
      id TEXT PRIMARY KEY NOT NULL,
      photo_id TEXT NOT NULL REFERENCES photos(id),
      original_path TEXT NOT NULL,
      filename TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'trashed',
      deleted_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      restored_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_trash_items_status ON trash_items(status);

    -- Settings (key-value store)
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `)

  // Drop legacy tables (removed in v0.2, data migrated to photo_groups.decision)
  sqlite.exec(`
    DROP TABLE IF EXISTS review_decisions;
    DROP TABLE IF EXISTS scan_discoveries;
  `)

  // Incremental migrations for existing DBs
  const addColumnIfMissing = (table: string, column: string, type: string) => {
    const cols = sqlite.pragma(`table_info(${table})`) as Array<{ name: string }>
    if (!cols.some((c) => c.name === column)) {
      sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`)
    }
  }

  addColumnIfMissing('photos', 'iso', 'INTEGER')
  addColumnIfMissing('photos', 'shutter_speed', 'TEXT')
  addColumnIfMissing('photos', 'aperture', 'REAL')
  addColumnIfMissing('photos', 'focal_length', 'REAL')

  // Review decision persistence (Issue 2)
  addColumnIfMissing('photo_groups', 'decision', 'TEXT')
  addColumnIfMissing('photo_groups', 'decided_at', 'TEXT')

  // Scan error feedback (Issue 3)
  addColumnIfMissing('scans', 'skipped_files', 'INTEGER NOT NULL DEFAULT 0')

  // EXIF filtering (v0.2)
  addColumnIfMissing('photos', 'latitude', 'REAL')
  addColumnIfMissing('photos', 'longitude', 'REAL')
  addColumnIfMissing('scans', 'option_enable_exif_filter', 'INTEGER NOT NULL DEFAULT 0')
  addColumnIfMissing('scans', 'filtered_files', 'INTEGER NOT NULL DEFAULT 0')
}
