import { Trash2 } from 'lucide-react'
import type { TrashSummary as TrashSummaryType } from '@renderer/stores/trash'
import { formatBytes, formatDateLine } from '@shared/utils'
import { useTranslation } from '@renderer/hooks/useTranslation'

interface TrashSummaryProps {
  summary: TrashSummaryType | null
}

export function TrashSummary({ summary }: TrashSummaryProps) {
  const { t } = useTranslation()
  const totalFiles = summary?.totalFiles ?? 0
  const totalSize = summary?.totalSize ?? 0
  const nextCleanup = summary?.nextCleanup ?? null

  const formatCleanupDate = (dateStr: string | null): string =>
    dateStr ? formatDateLine(dateStr) : t('trash.noneScheduled')

  return (
    <div className="bg-surface-secondary rounded-xl p-6 flex items-center gap-6">
      {/* Large trash icon */}
      <div className="w-16 h-16 bg-surface-primary rounded-full flex items-center justify-center text-primary shadow-sm shrink-0">
        <Trash2 className="w-7 h-7" />
      </div>

      {/* Title + stats */}
      <div className="flex flex-col gap-1.5">
        <h2 className="text-xl font-heading font-bold text-foreground-primary">
          {t('trash.title')}
        </h2>
        <div className="flex items-center gap-2 text-sm text-foreground-secondary font-mono">
          <span>{totalFiles.toLocaleString()} {t('trash.files')}</span>
          <span className="text-foreground-muted">·</span>
          <span>{formatBytes(totalSize)}</span>
          <span className="text-foreground-muted">·</span>
          <span>
            {t('trash.nextCleanup')}:{' '}
            <span className="text-foreground-primary">{formatCleanupDate(nextCleanup)}</span>
          </span>
        </div>
      </div>
    </div>
  )
}
