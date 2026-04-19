import { useEffect } from 'react'
import { X } from 'lucide-react'
import type { ExportProgress } from '@shared/types'
import { ProgressBar } from './ProgressBar'
import { formatBytes } from '@shared/utils'
import { useFocusTrap } from '@renderer/hooks/useFocusTrap'
import { useTranslation } from '@renderer/hooks/useTranslation'

interface ProgressOverlayProps {
  progress: ExportProgress
  onCancel: () => void
}

function formatSpeed(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`
}

export function ProgressOverlay({ progress, onCancel }: ProgressOverlayProps) {
  const dialogRef = useFocusTrap<HTMLDivElement>()
  const { t } = useTranslation()

  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    const handler = () => onCancel()
    el.addEventListener('dialog-close', handler)
    return () => el.removeEventListener('dialog-close', handler)
  }, [dialogRef, onCancel])

  const percent =
    progress.totalFiles > 0
      ? Math.round((progress.processedFiles / progress.totalFiles) * 100)
      : 0

  const currentFilename = progress.currentFile
    ? progress.currentFile.split('/').pop() ?? progress.currentFile
    : '—'

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
    >
      <div
        ref={dialogRef}
        aria-label="Export progress"
        className="bg-surface-primary rounded-xl border border-border p-8 w-full max-w-lg mx-4 space-y-6 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-heading font-semibold text-foreground-primary">
              {t('export.exporting')}
            </h2>
            <p className="mt-1 text-sm font-mono text-foreground-muted truncate">
              {currentFilename}
            </p>
          </div>
          <span className="font-mono text-4xl font-bold text-primary leading-none shrink-0">
            {percent}%
          </span>
        </div>

        {/* Progress bar */}
        <ProgressBar percent={percent} />

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xs text-foreground-muted font-mono uppercase tracking-wider">{t('export.files')}</p>
            <p className="mt-1 text-sm font-mono font-semibold text-foreground-primary">
              {progress.processedFiles.toLocaleString()} / {progress.totalFiles.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-xs text-foreground-muted font-mono uppercase tracking-wider">{t('export.transferred')}</p>
            <p className="mt-1 text-sm font-mono font-semibold text-foreground-primary">
              {formatBytes(progress.transferredSize)}
            </p>
          </div>
          <div>
            <p className="text-xs text-foreground-muted font-mono uppercase tracking-wider">{t('export.speed')}</p>
            <p className="mt-1 text-sm font-mono font-semibold text-primary">
              {formatSpeed(progress.speed)}
            </p>
          </div>
        </div>

        {/* Cancel button */}
        <div className="flex justify-center">
          <button
            onClick={onCancel}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-error/20 text-error font-medium text-sm hover:bg-error-light transition-colors"
          >
            <X className="w-4 h-4" />
            {t('export.cancelExport')}
          </button>
        </div>
      </div>
    </div>
  )
}
