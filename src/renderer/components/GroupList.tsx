import { useEffect, useRef, useState, useCallback } from 'react'
import { FixedSizeList } from 'react-window'
import { Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { useReviewStore } from '@renderer/stores/review'
import { formatBytes } from '@shared/utils'
import { useTranslation } from '@renderer/hooks/useTranslation'
import { REVIEW_STATUS } from '@shared/types'

interface GroupItemProps {
  group: { id: string; fileCount: number; reclaimableSize: number; reviewStatus: string; decision: string | null; hasPurged: boolean; masterFilename: string | null }
  index: number
  page: number
  pageSize: number
  isActive: boolean
  pendingCount: number
  onSelect: (id: string) => void
  t: (key: any) => string
}

function GroupItem({ group, index, page, pageSize, isActive, pendingCount, onSelect, t }: GroupItemProps) {
  const isReviewed = group.reviewStatus === REVIEW_STATUS.REVIEWED
  const isKeptAll = isReviewed && group.decision === 'kept_all'
  const hasDeleted = isReviewed && group.decision === 'duplicates_deleted'

  return (
    <div className="px-2 py-1">
      <button
        onClick={() => onSelect(group.id)}
        className={`w-full text-left px-3 py-2.5 rounded-lg transition-all ${
          isActive
            ? 'bg-surface-primary text-primary border-l-4 border-primary shadow-[0_2px_12px_rgba(0,98,255,0.15)]'
            : 'text-foreground-secondary hover:bg-surface-primary hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)] border-l-4 border-transparent'
        }`}
      >
        <div className="flex items-center justify-between gap-1">
          <span className={`text-[13px] font-semibold truncate ${isActive ? 'text-primary' : ''}`}>
            {t('review.group')} {(page - 1) * pageSize + index + 1}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {hasDeleted && pendingCount > 0 && (
              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-warning/10 text-warning">
                {t('review.pendingTrash')} -{pendingCount}
              </span>
            )}
            {hasDeleted && pendingCount === 0 && group.hasPurged && (
              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-foreground-muted/10 text-foreground-muted">
                {t('review.permanentlyDeleted')}
              </span>
            )}
            {hasDeleted && pendingCount === 0 && !group.hasPurged && (
              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-error/10 text-error">
                {t('review.movedToTrash')}
              </span>
            )}
            {isKeptAll && (
              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-success/10 text-success">
                {t('review.decisionKeptAll')}
              </span>
            )}
            <span className="text-[10px] font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
              {group.fileCount}
            </span>
          </div>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="text-[10px] text-foreground-muted font-mono">
            {formatBytes(group.reclaimableSize)} {t('review.reclaimable')}
          </span>
        </div>
        {group.masterFilename && (
          <p className="mt-0.5 text-[11px] text-foreground-muted truncate">
            {group.masterFilename}
          </p>
        )}
      </button>
    </div>
  )
}

interface GroupListProps {
  className?: string
}

export function GroupList({ className = '' }: GroupListProps) {
  const {
    groups,
    total,
    page,
    pageSize,
    search,
    selectedGroupId,
    loading,
    pendingDeletions,
    selectGroup,
    setSearch,
    nextPage,
    prevPage,
    loadGroups,
  } = useReviewStore()

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const listContainerRef = useRef<HTMLDivElement>(null)
  const [containerHeight, setContainerHeight] = useState(400)
  const { t } = useTranslation()

  useEffect(() => {
    if (!listContainerRef.current) return
    const observer = new ResizeObserver((entries) => {
      setContainerHeight(entries[0].contentRect.height)
    })
    observer.observe(listContainerRef.current)
    return () => observer.disconnect()
  }, [])

  const handleSearchChange = (value: string) => {
    setSearch(value)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => {
      loadGroups()
    }, 300)
  }

  const maxPage = Math.ceil(total / pageSize)

  return (
    <div className={`flex flex-col h-full bg-surface-secondary ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-border shrink-0">
        <h2 className="text-xs font-black uppercase tracking-widest text-foreground-muted mb-3">
          {t('review.duplicateGroups')}
        </h2>
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-foreground-muted pointer-events-none" />
          <input
            type="text"
            placeholder={t('review.searchGroups')}
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm bg-surface-primary border border-border rounded-lg text-foreground-primary placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
          />
        </div>
      </div>

      {/* Group list */}
      <div className="flex-1 overflow-hidden py-2" ref={listContainerRef}>
        {loading && groups.length === 0 ? (
          <div className="flex items-center justify-center h-24">
            <span className="text-sm text-foreground-muted">{t('common.loading')}</span>
          </div>
        ) : groups.length === 0 ? (
          <div className="flex items-center justify-center h-24 px-4 text-center">
            <span className="text-sm text-foreground-muted">{t('review.noGroupsFound')}</span>
          </div>
        ) : groups.length * 78 <= containerHeight ? (
          // Items fit — plain list, no scrollbar
          <div>
            {groups.map((group, index) => (
              <GroupItem key={group.id} group={group} index={index} page={page} pageSize={pageSize} isActive={group.id === selectedGroupId} pendingCount={pendingDeletions.filter((d) => d.groupId === group.id).length} onSelect={selectGroup} t={t} />
            ))}
          </div>
        ) : (
          // Items overflow — virtualized list with native scroll
          <FixedSizeList
            height={containerHeight}
            width="100%"
            itemCount={groups.length}
            itemSize={78}
          >
            {({ index, style }) => {
              const group = groups[index]
              return (
                <div style={style}>
                  <GroupItem group={group} index={index} page={page} pageSize={pageSize} isActive={group.id === selectedGroupId} pendingCount={pendingDeletions.filter((d) => d.groupId === group.id).length} onSelect={selectGroup} t={t} />
                </div>
              )
            }}
          </FixedSizeList>
        )}
      </div>

      {/* Pagination */}
      {total > pageSize && (
        <div className="shrink-0 border-t border-border px-3 py-2.5 flex items-center justify-between">
          <button
            onClick={prevPage}
            disabled={page <= 1}
            className="p-1.5 rounded-lg text-foreground-secondary hover:bg-surface-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Previous page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs text-foreground-muted font-mono">
            {page} / {maxPage || 1}
          </span>
          <button
            onClick={nextPage}
            disabled={page >= maxPage}
            className="p-1.5 rounded-lg text-foreground-secondary hover:bg-surface-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Next page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
