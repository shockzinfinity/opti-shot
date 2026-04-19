// @TASK P2-R1 - Folder service tests
// @TEST tests/main/services/folder.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { createTestDb, type AppDatabase } from '@main/db'
import {
  addFolder,
  removeFolder,
  listFolders,
  validateFolder,
} from '@main/services/folder'

describe('FolderService', () => {
  let db: AppDatabase
  let tempDir: string
  let childDir: string

  beforeEach(() => {
    db = createTestDb(':memory:')
    // Create real temp directories for validation tests
    tempDir = mkdtempSync(join(tmpdir(), 'optishot-folder-test-'))
    childDir = mkdtempSync(join(tempDir, 'child-'))
  })

  afterEach(() => {
    db.$client.close()
    rmSync(tempDir, { recursive: true, force: true })
  })

  describe('addFolder', () => {
    it('should add a folder and return the record', () => {
      const result = addFolder(db, tempDir)

      expect(result.id).toBeDefined()
      expect(result.path).toBe(tempDir)
      expect(result.includeSubfolders).toBe(true)
      expect(result.isAccessible).toBe(true)
      expect(result.addedAt).toBeDefined()
    })

    it('should add a folder with includeSubfolders=false', () => {
      const result = addFolder(db, tempDir, false)

      expect(result.includeSubfolders).toBe(false)
    })

    it('should appear in list after adding', () => {
      addFolder(db, tempDir)
      const folders = listFolders(db)

      expect(folders).toHaveLength(1)
      expect(folders[0].path).toBe(tempDir)
    })

    it('should reject duplicate paths', () => {
      addFolder(db, tempDir)

      expect(() => addFolder(db, tempDir)).toThrow('already registered')
    })

    it('should reject non-existent path', () => {
      const fakePath = join(tempDir, 'does-not-exist')

      expect(() => addFolder(db, fakePath)).toThrow('does not exist')
    })

    it('should reject child path when parent is already registered (circular)', () => {
      addFolder(db, tempDir)

      expect(() => addFolder(db, childDir)).toThrow('already covered by')
    })

    it('should reject parent path when child is already registered (circular)', () => {
      addFolder(db, childDir)

      expect(() => addFolder(db, tempDir)).toThrow('contains already registered')
    })

    it('should generate a valid UUID for the folder id', () => {
      const result = addFolder(db, tempDir)

      // UUID v4 format: 8-4-4-4-12 hex characters
      expect(result.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      )
    })

    it('should store ISO datetime in addedAt', () => {
      const before = new Date().toISOString()
      const result = addFolder(db, tempDir)
      const after = new Date().toISOString()

      expect(result.addedAt >= before).toBe(true)
      expect(result.addedAt <= after).toBe(true)
    })
  })

  describe('removeFolder', () => {
    it('should remove a folder by id', () => {
      const added = addFolder(db, tempDir)
      removeFolder(db, added.id)

      const folders = listFolders(db)
      expect(folders).toHaveLength(0)
    })

    it('should throw when removing non-existent id', () => {
      expect(() => removeFolder(db, 'non-existent-id')).toThrow('not found')
    })

    it('should only remove the targeted folder', () => {
      const secondDir = mkdtempSync(join(tmpdir(), 'optishot-folder-test2-'))
      try {
        const folder1 = addFolder(db, tempDir)
        addFolder(db, secondDir)

        removeFolder(db, folder1.id)

        const folders = listFolders(db)
        expect(folders).toHaveLength(1)
        expect(folders[0].path).toBe(secondDir)
      } finally {
        rmSync(secondDir, { recursive: true, force: true })
      }
    })
  })

  describe('listFolders', () => {
    it('should return empty array when no folders exist', () => {
      const folders = listFolders(db)
      expect(folders).toEqual([])
    })

    it('should return all added folders', () => {
      const secondDir = mkdtempSync(join(tmpdir(), 'optishot-folder-test2-'))
      try {
        addFolder(db, tempDir)
        addFolder(db, secondDir)

        const folders = listFolders(db)
        expect(folders).toHaveLength(2)
      } finally {
        rmSync(secondDir, { recursive: true, force: true })
      }
    })
  })

  describe('validateFolder', () => {
    it('should return valid=true for accessible directory', () => {
      const result = validateFolder(tempDir)

      expect(result.valid).toBe(true)
      expect(result.path).toBe(tempDir)
    })

    it('should return valid=false for non-existent path', () => {
      const result = validateFolder('/path/that/does/not/exist')

      expect(result.valid).toBe(false)
      expect(result.reason).toBeDefined()
    })

    it('should return valid=false for a file (not a directory)', () => {
      const filePath = join(tempDir, 'testfile.txt')
      require('fs').writeFileSync(filePath, 'test')

      const result = validateFolder(filePath)

      expect(result.valid).toBe(false)
      expect(result.reason).toContain('not a directory')
    })
  })
})
