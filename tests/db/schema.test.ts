// @TASK P0-T0.2 - Tests for Drizzle ORM schema and migration
// @TEST tests/db/schema.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq } from 'drizzle-orm'
import * as schema from '../../src/main/db/schema'
import { migrate } from '../../src/main/db/migrate'
import type { AppDatabase } from '../../src/main/db/index'

function createTestDb(): AppDatabase {
  const sqlite = new Database(':memory:')
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  migrate(db)
  return db
}

describe('Database Schema & Migration', () => {
  let db: AppDatabase

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    db.$client.close()
  })

  it('should create all 6 tables', () => {
    const tables = db.$client
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as { name: string }[]

    const tableNames = tables.map((t) => t.name).sort()
    expect(tableNames).toEqual([
      'photo_groups',
      'photos',
      'scan_folders',
      'scans',
      'settings',
      'trash_items',
    ])
  })

  it('should create required indexes', () => {
    const indexes = db.$client
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name")
      .all() as { name: string }[]

    const indexNames = indexes.map((i) => i.name)
    expect(indexNames).toContain('idx_scans_status')
    expect(indexNames).toContain('idx_photos_phash')
    expect(indexNames).toContain('idx_photos_group_id')
    expect(indexNames).toContain('idx_trash_items_status')
  })

  it('should be idempotent (run migration twice without error)', () => {
    expect(() => migrate(db)).not.toThrow()
  })
})

describe('CRUD Operations', () => {
  let db: AppDatabase

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    db.$client.close()
  })

  it('should insert and query scan_folders', () => {
    db.insert(schema.scanFolders).values({
      id: 'folder-001',
      path: '/Users/test/Photos',
      includeSubfolders: true,
      isAccessible: true,
      addedAt: '2026-01-01T00:00:00Z',
    }).run()

    const rows = db.select().from(schema.scanFolders).all()
    expect(rows).toHaveLength(1)
    expect(rows[0].path).toBe('/Users/test/Photos')
    expect(rows[0].includeSubfolders).toBe(true)
  })

  it('should insert scans with embedded options', () => {
    db.insert(schema.scans).values({
      id: 'scan-001',
      status: 'running',
      startedAt: '2026-01-01T10:00:00Z',
      optionMode: 'full',
      optionPhashThreshold: 8,
      optionSsimThreshold: 0.85,
    }).run()

    const rows = db.select().from(schema.scans).all()
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('running')
    expect(rows[0].optionMode).toBe('full')
    expect(rows[0].optionSsimThreshold).toBe(0.85)
  })

  it('should handle photoGroups and photos with circular ref', () => {
    // Create group first (masterId is null initially)
    db.insert(schema.photoGroups).values({
      id: 'group-001',
      fileCount: 2,
      totalSize: 5000000,
      reclaimableSize: 2500000,
      masterId: null,
      reviewStatus: 'pending',
    }).run()

    // Create photos in that group
    db.insert(schema.photos).values({
      id: 'photo-001',
      filename: 'IMG_001.jpg',
      path: '/Users/test/Photos/IMG_001.jpg',
      fileSize: 2500000,
      width: 4032,
      height: 3024,
      qualityScore: 85.5,
      phash: 'a1b2c3d4e5f6',
      isMaster: true,
      groupId: 'group-001',
      thumbnailPath: '/cache/thumb-001.jpg',
    }).run()

    // Now update group masterId (circular ref resolved)
    db.update(schema.photoGroups)
      .set({ masterId: 'photo-001' })
      .where(eq(schema.photoGroups.id, 'group-001'))
      .run()

    const group = db.select().from(schema.photoGroups).all()
    expect(group[0].masterId).toBe('photo-001')

    const photo = db.select().from(schema.photos).all()
    expect(photo[0].isMaster).toBe(true)
    expect(photo[0].qualityScore).toBe(85.5)
  })

  it('should insert trash items', () => {
    // Setup: group + photo
    db.insert(schema.photoGroups).values({
      id: 'group-t1',
      fileCount: 1,
      totalSize: 1000,
      reclaimableSize: 0,
    }).run()

    db.insert(schema.photos).values({
      id: 'photo-t1',
      filename: 'trash.jpg',
      path: '/trash.jpg',
      phash: 'bbb222',
      groupId: 'group-t1',
    }).run()

    db.insert(schema.trashItems).values({
      id: 'trash-001',
      photoId: 'photo-t1',
      originalPath: '/Users/test/Photos/trash.jpg',
      filename: 'trash.jpg',
      fileSize: 3000000,
      status: 'trashed',
      deletedAt: '2026-01-01T15:00:00Z',
      expiresAt: '2026-01-31T15:00:00Z',
    }).run()

    const rows = db.select().from(schema.trashItems).all()
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('trashed')
  })

  it('should insert and query settings', () => {
    db.insert(schema.settings).values({
      key: 'scan.phash_threshold',
      value: JSON.stringify(8),
      updatedAt: '2026-01-01T00:00:00Z',
    }).run()

    const rows = db.select()
      .from(schema.settings)
      .where(eq(schema.settings.key, 'scan.phash_threshold'))
      .all()

    expect(rows).toHaveLength(1)
    expect(JSON.parse(rows[0].value)).toBe(8)
  })

  it('should cascade delete photos when group is deleted', () => {
    db.insert(schema.photoGroups).values({
      id: 'group-del',
      fileCount: 1,
      totalSize: 1000,
      reclaimableSize: 0,
    }).run()

    db.insert(schema.photos).values({
      id: 'photo-del',
      filename: 'del.jpg',
      path: '/del.jpg',
      phash: 'ccc333',
      groupId: 'group-del',
    }).run()

    // Delete group — should cascade to photos
    db.delete(schema.photoGroups)
      .where(eq(schema.photoGroups.id, 'group-del'))
      .run()

    const photos = db.select().from(schema.photos).all()
    expect(photos).toHaveLength(0)
  })
})
