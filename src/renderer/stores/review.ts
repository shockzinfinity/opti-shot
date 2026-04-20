import { create } from 'zustand'
import { REVIEW_STATUS } from '@shared/types'

export interface GroupListItem {
  id: string
  fileCount: number
  totalSize: number
  reclaimableSize: number
  reviewStatus: string
  decision: string | null
  hasPurged: boolean
  masterFilename: string | null
}

export interface PhotoItem {
  id: string
  filename: string
  path: string
  fileSize: number
  width: number
  height: number
  qualityScore: number
  phash: string
  isMaster: boolean
  groupId: string
  thumbnailPath: string
  takenAt: string | null
  cameraModel: string | null
  lensModel: string | null
  iso: number | null
  shutterSpeed: string | null
  aperture: number | null
  focalLength: number | null
  trashStatus: string | null
}

export interface GroupDetail {
  id: string
  fileCount: number
  totalSize: number
  reclaimableSize: number
  masterId: string | null
  reviewStatus: string
  photos: PhotoItem[]
}

/** Photos pending deletion after review */
export interface PendingDeletion {
  photoId: string
  filename: string
  fileSize: number
  groupId: string
}

interface ReviewState {
  groups: GroupListItem[]
  total: number
  page: number
  pageSize: number
  search: string
  selectedGroupId: string | null
  groupDetail: GroupDetail | null
  loading: boolean
  detailLoading: boolean
  pendingDeletions: PendingDeletion[]
  executing: boolean
  // actions
  loadGroups: () => Promise<void>
  selectGroup: (id: string) => Promise<void>
  setSearch: (search: string) => void
  nextPage: () => void
  prevPage: () => void
  changeMaster: (photoId: string) => Promise<void>
  keepAll: () => Promise<void>
  markReviewed: () => Promise<void>
  executeDeletions: () => Promise<void>
  resetReview: () => void
  nextGroup: () => void
  prevGroup: () => void
}

export const useReviewStore = create<ReviewState>((set, get) => ({
  groups: [],
  total: 0,
  page: 1,
  pageSize: 50,
  search: '',
  selectedGroupId: null,
  groupDetail: null,
  loading: false,
  detailLoading: false,
  pendingDeletions: [],
  executing: false,

  loadGroups: async () => {
    const { page, pageSize, search } = get()
    set({ loading: true })
    try {
      const offset = (page - 1) * pageSize
      const response = await window.electron.query('group.list', {
        offset,
        limit: pageSize,
        search,
      })
      const result = response.success ? (response.data as unknown as { groups: GroupListItem[]; total: number }) : undefined

      if (result) {
        set({ groups: result.groups, total: result.total })
        if (!get().selectedGroupId && result.groups.length > 0) {
          await get().selectGroup(result.groups[0].id)
        }
      }

      // Reconstruct pending deletions from DB
      try {
        const pendingResponse = await window.electron.query('review.getPending')
        if (pendingResponse.success && pendingResponse.data) {
          set({ pendingDeletions: pendingResponse.data as unknown as PendingDeletion[] })
        }
      } catch (pendingErr) {
        console.error('Failed to reconstruct pending deletions:', pendingErr)
      }
    } catch (err) {
      console.error('Failed to load groups:', err)
    } finally {
      set({ loading: false })
    }
  },

  selectGroup: async (id: string) => {
    set({ selectedGroupId: id, detailLoading: true })
    try {
      const response = await window.electron.query('group.detail', { groupId: id })
      const detail = response.success ? (response.data as unknown as GroupDetail) : undefined
      if (detail) {
        set({ groupDetail: detail })
      }
    } catch (err) {
      console.error('Failed to load group detail:', err)
    } finally {
      set({ detailLoading: false })
    }
  },

  setSearch: (search: string) => {
    set({ search, page: 1 })
  },

  nextPage: () => {
    const { page, pageSize, total } = get()
    const maxPage = Math.ceil(total / pageSize)
    if (page < maxPage) {
      set({ page: page + 1 })
      get().loadGroups()
    }
  },

  prevPage: () => {
    const { page } = get()
    if (page > 1) {
      set({ page: page - 1 })
      get().loadGroups()
    }
  },

  changeMaster: async (photoId: string) => {
    const { selectedGroupId, groupDetail } = get()
    if (!selectedGroupId || !groupDetail) return
    try {
      const response = await window.electron.command('group.changeMaster', { groupId: selectedGroupId, newMasterId: photoId })
      if (!response.success) return
      const updatedPhotos = groupDetail.photos.map((p) => ({
        ...p,
        isMaster: p.id === photoId,
      }))
      set({
        groupDetail: {
          ...groupDetail,
          masterId: photoId,
          photos: updatedPhotos,
        },
      })
    } catch (err) {
      console.error('Failed to change master:', err)
    }
  },

  // Keep all photos — restore trashed photos, remove pending, mark reviewed
  keepAll: async () => {
    const { selectedGroupId, groups } = get()
    if (!selectedGroupId) return
    try {
      // Restore trashed photos if this group was previously 'duplicates_deleted'
      const currentDecision = groups.find((g) => g.id === selectedGroupId)?.decision
      if (currentDecision === 'duplicates_deleted') {
        await window.electron.command('trash.restoreGroup', { groupId: selectedGroupId })
      }

      const response = await window.electron.command('group.markReviewed', { groupId: selectedGroupId, decision: 'kept_all' })
      if (!response.success) return
      set((state) => ({
        groups: state.groups.map((g) =>
          g.id === selectedGroupId ? { ...g, reviewStatus: REVIEW_STATUS.REVIEWED, decision: 'kept_all' } : g
        ),
        groupDetail: state.groupDetail
          ? { ...state.groupDetail, reviewStatus: REVIEW_STATUS.REVIEWED }
          : null,
        pendingDeletions: state.pendingDeletions.filter((d) => d.groupId !== selectedGroupId),
      }))
      get().nextGroup()
    } catch (err) {
      console.error('Failed to keep all:', err)
    }
  },

  // Mark duplicates for deletion, keep master only
  markReviewed: async () => {
    const { selectedGroupId, groupDetail } = get()
    if (!selectedGroupId || !groupDetail) return
    try {
      const response = await window.electron.command('group.markReviewed', { groupId: selectedGroupId, decision: 'duplicates_deleted' })
      if (!response.success) return

      // Add non-master photos to pending deletions
      const duplicates = groupDetail.photos
        .filter((p) => p.id !== groupDetail.masterId)
        .map((p) => ({
          photoId: p.id,
          filename: p.filename,
          fileSize: p.fileSize,
          groupId: selectedGroupId,
        }))

      set((state) => ({
        groups: state.groups.map((g) =>
          g.id === selectedGroupId ? { ...g, reviewStatus: REVIEW_STATUS.REVIEWED, decision: 'duplicates_deleted' } : g
        ),
        groupDetail: state.groupDetail
          ? { ...state.groupDetail, reviewStatus: REVIEW_STATUS.REVIEWED }
          : null,
        pendingDeletions: [...state.pendingDeletions.filter((d) => d.groupId !== selectedGroupId), ...duplicates],
      }))
      get().nextGroup()
    } catch (err) {
      console.error('Failed to mark reviewed:', err)
    }
  },

  // Execute all pending deletions — move to trash, then reload
  executeDeletions: async () => {
    const { pendingDeletions } = get()
    if (pendingDeletions.length === 0) return
    set({ executing: true })
    try {
      for (const item of pendingDeletions) {
        await window.electron.command('trash.move', { photoId: item.photoId })
      }
      set({ pendingDeletions: [], executing: false })
      // Reload groups to reflect updated state
      await get().loadGroups()
    } catch (err) {
      console.error('Failed to execute deletions:', err)
      set({ executing: false })
    }
  },

  resetReview: () => {
    set({ pendingDeletions: [] })
  },

  nextGroup: () => {
    const { groups, selectedGroupId } = get()
    const idx = groups.findIndex((g) => g.id === selectedGroupId)
    if (idx >= 0 && idx < groups.length - 1) {
      get().selectGroup(groups[idx + 1].id)
    }
  },

  prevGroup: () => {
    const { groups, selectedGroupId } = get()
    const idx = groups.findIndex((g) => g.id === selectedGroupId)
    if (idx > 0) {
      get().selectGroup(groups[idx - 1].id)
    }
  },
}))
