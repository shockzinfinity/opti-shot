import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pause, X, AlertTriangle, AlertCircle } from 'lucide-react'
import { useScanStore } from '../stores/scan'
import { useFolderStore } from '../stores/folder'
import { ProgressBar } from '../components/ProgressBar'
import { ScanStats } from '../components/ScanStats'
import { DiscoveryFeed } from '../components/DiscoveryFeed'
import { PageCloseButton } from '../components/PageCloseButton'
import { useTranslation } from '@renderer/hooks/useTranslation'

export function ScanProgress() {
  const navigate = useNavigate()
  const { isScanning, isPaused, isComplete, errorMessage, progress, discoveries, startListening, startScan, pauseScan, cancelScan, reset: resetScan } =
    useScanStore()
  const { t } = useTranslation()

  const scanStarted = useRef(false)

  useEffect(() => {
    // Reset previous scan state and start fresh
    if (!scanStarted.current) {
      scanStarted.current = true
      resetScan()
      const folderStore = useFolderStore.getState()
      folderStore.commitFolders().then(() => {
        startScan(folderStore.options)
      })
    }

    const unsubscribe = startListening()
    return unsubscribe
  }, [startListening])

  useEffect(() => {
    if (isComplete) {
      const timer = setTimeout(() => {
        navigate('/review')
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [isComplete, navigate])

  const percent =
    progress && progress.totalFiles > 0
      ? Math.round((progress.processedFiles / progress.totalFiles) * 100)
      : 0

  const title = isComplete
    ? t('scan.complete')
    : isPaused
    ? t('scan.paused')
    : t('scan.inProgress')

  return (
    <div className="max-w-[800px] mx-auto p-8 space-y-8">
      <div className="flex justify-end">
        <PageCloseButton />
      </div>

      {/* Progress Card */}
      <div className="bg-surface-primary rounded-xl border border-border p-6 space-y-6">
        {/* Title + percentage row */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0 space-y-1.5">
            <h1 className="text-xl font-heading font-semibold text-foreground-primary">
              {title}
            </h1>
            <p className="text-sm font-mono text-foreground-muted truncate">
              {progress?.currentFile ?? '—'}
            </p>
          </div>
          <span className="font-mono text-[48px] leading-none font-bold text-primary shrink-0">
            {percent}%
          </span>
        </div>

        {/* Progress bar */}
        <ProgressBar percent={percent} />

        {/* Stats */}
        {progress ? (
          <ScanStats
            processedFiles={progress.processedFiles}
            totalFiles={progress.totalFiles}
            discoveredGroups={progress.discoveredGroups}
            elapsedSeconds={progress.elapsedSeconds}
            estimatedRemainingSeconds={progress.estimatedRemainingSeconds}
            scanSpeed={progress.scanSpeed}
          />
        ) : (
          <div className="text-sm text-foreground-muted">
            {t('scan.waitingForData')}
          </div>
        )}
      </div>

      {/* Skipped files warning */}
      {isComplete && progress && progress.skippedCount > 0 && (
        <div className="bg-warning/10 border border-warning/20 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
          <div className="text-sm text-foreground-primary">
            <p className="font-medium">
              {t('scan.skippedFiles').replace('{count}', String(progress.skippedCount))}
            </p>
          </div>
        </div>
      )}

      {/* Scan error */}
      {errorMessage && (
        <div className="bg-error/10 border border-error/20 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-error shrink-0 mt-0.5" />
          <div className="text-sm text-foreground-primary">
            <p className="font-medium">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* Discovery Feed */}
      <DiscoveryFeed discoveries={discoveries} />

      {/* Control buttons */}
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={pauseScan}
          disabled={!isScanning || isPaused || isComplete}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border text-foreground-primary font-medium text-sm hover:bg-surface-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Pause className="w-4 h-4" />
          {t('scan.pause')}
        </button>
        <button
          onClick={cancelScan}
          disabled={isComplete}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-error/20 text-error font-medium text-sm hover:bg-error-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <X className="w-4 h-4" />
          {t('scan.cancel')}
        </button>
      </div>
    </div>
  )
}
