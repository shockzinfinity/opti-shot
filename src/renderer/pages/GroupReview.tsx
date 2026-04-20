import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layers, Info } from 'lucide-react'
import { ScanInfoPanel } from '@renderer/components/ScanInfoPanel'
import { useReviewStore } from '@renderer/stores/review'
import { PageCloseButton } from '@renderer/components/PageCloseButton'
import { GroupList } from '@renderer/components/GroupList'
import { GroupDetail } from '@renderer/components/GroupDetail'
import { formatBytes, formatNumber } from '@shared/utils'
import { useTranslation } from '@renderer/hooks/useTranslation'
import { REVIEW_STATUS } from '@shared/types'

function EmptyState() {
  const { t } = useTranslation()
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
      <div className="w-16 h-16 rounded-xl bg-surface-secondary flex items-center justify-center">
        <Layers className="w-8 h-8 text-foreground-muted" />
      </div>
      <div>
        <h2 className="text-lg font-heading font-semibold text-foreground-primary">
          {t('review.selectGroup')}
        </h2>
        <p className="text-sm text-foreground-muted mt-1">
          {t('review.selectGroupDesc')}
        </p>
      </div>
    </div>
  )
}

function ReviewActionBar() {
  const { groups, total, groupDetail, keepAll, markReviewed, pendingDeletions, executeDeletions, executing } = useReviewStore()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [showScanInfo, setShowScanInfo] = useState(false)

  const reviewedCount = groups.filter((g) => g.reviewStatus === REVIEW_STATUS.REVIEWED).length
  const allReviewed = groups.length > 0 && reviewedCount === groups.length
  const pendingSize = pendingDeletions.reduce((sum, d) => sum + d.fileSize, 0)
  const currentGroup = groups.find((g) => g.id === groupDetail?.id)
  const isCurrentPurged = currentGroup?.hasPurged ?? false

  const handleExecute = () => {
    const msg = t('review.executeConfirm')
      .replace('${count}', String(pendingDeletions.length))
      .replace('${size}', formatBytes(pendingSize))
    if (!confirm(msg)) return
    executeDeletions().then(() => {
      navigate('/')
    })
  }

  return (
    <>
    {showScanInfo && <ScanInfoPanel onClose={() => setShowScanInfo(false)} />}
    <div className="absolute bottom-0 left-0 w-full bg-surface-primary/90 backdrop-blur-md px-8 py-4 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] border-t border-border flex items-center justify-between z-10">
      {/* Left: stats */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-foreground-muted">{t('review.reviewed')}: </span>
          <span className="font-mono font-semibold text-foreground-primary">
            {formatNumber(reviewedCount)}/{formatNumber(groups.length)}
          </span>
          <span className="text-foreground-muted"> {t('review.groups')}</span>
          <button
            onClick={() => setShowScanInfo(true)}
            className="w-5 h-5 rounded-full border border-border text-foreground-muted hover:text-primary hover:border-primary flex items-center justify-center transition-colors"
            aria-label={t('scanInfo.title')}
          >
            <Info className="w-3 h-3" />
          </button>
        </div>
        {pendingDeletions.length > 0 && (
          <div className="text-sm">
            <span className="text-foreground-muted">{t('review.pendingDelete')}: </span>
            <span className="font-mono font-semibold text-error">
              {pendingDeletions.length}{t('review.filesUnit')}
            </span>
            <span className="text-foreground-muted"> ({formatBytes(pendingSize)})</span>
          </div>
        )}
      </div>

      {/* Right: actions — change based on review state */}
      <div className="flex items-center gap-3">
        {/* Group-level actions (always available) */}
        <button
          onClick={keepAll}
          disabled={!groupDetail || isCurrentPurged}
          className="px-4 py-2.5 rounded-xl border border-border text-foreground-secondary text-sm font-semibold hover:bg-surface-secondary transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {t('review.keepAll')}
        </button>
        <button
          onClick={markReviewed}
          disabled={!groupDetail || isCurrentPurged}
          className="px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-hover transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
        >
          {t('review.deleteDuplicates')} →
        </button>

        {/* Execution action (appears when all reviewed) */}
        {allReviewed && (
          <>
            <div className="w-px h-8 bg-border" />
            {pendingDeletions.length > 0 ? (
              <button
                onClick={handleExecute}
                disabled={executing}
                className="px-5 py-2.5 rounded-xl bg-error text-white text-sm font-bold hover:bg-error/90 transition-all disabled:opacity-40 shadow-sm"
              >
                {executing ? t('common.loading') : t('review.executeDelete')}
              </button>
            ) : (
              <button
                onClick={() => navigate('/')}
                className="px-5 py-2.5 rounded-xl bg-success text-white text-sm font-bold hover:bg-success/90 transition-all shadow-sm"
              >
                {t('review.done')}
              </button>
            )}
          </>
        )}
      </div>
    </div>
    </>
  )
}

export function GroupReview() {
  const { selectedGroupId, loadGroups, nextGroup, prevGroup } = useReviewStore()

  // Always reload from DB on page entry (not just on first mount)
  useEffect(() => {
    // Reset selection to force fresh load from DB
    useReviewStore.setState({ selectedGroupId: null, groupDetail: null })
    loadGroups()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't hijack shortcuts when typing in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault()
        prevGroup()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        nextGroup()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        // markReviewed is called inline to avoid stale closure issues
        const store = useReviewStore.getState()
        store.markReviewed()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [nextGroup, prevGroup])

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <GroupList className="w-[280px] shrink-0 border-r border-border" />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        <div className="flex justify-end p-3 shrink-0">
          <PageCloseButton />
        </div>
        {selectedGroupId ? <GroupDetail /> : <EmptyState />}
        <ReviewActionBar />
      </div>
    </div>
  )
}
