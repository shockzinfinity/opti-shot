import { useEffect } from 'react'
import { FolderSync, Undo2 } from 'lucide-react'
import { useOrganizeStore } from '@renderer/stores/organize'
import { useTranslation } from '@renderer/hooks/useTranslation'
import { formatDateTime } from '@shared/utils'

interface RecentOrganizeCardProps {
  className?: string
}

export function RecentOrganizeCard({ className = '' }: RecentOrganizeCardProps) {
  const { lastJob, loadLastJob, runUndo } = useOrganizeStore()
  const { t } = useTranslation()

  useEffect(() => { loadLastJob() }, [loadLastJob])

  if (!lastJob) return null

  return (
    <div className={`bg-surface-secondary rounded-xl p-5 space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderSync className="w-4 h-4 text-primary" />
          <h3 className="font-heading font-semibold text-sm">{t('organize.lastOrganize')}</h3>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-1 min-w-0">
          <p className="text-sm font-mono truncate">{lastJob.folder}</p>
          <p className="text-xs text-foreground-muted">
            {formatDateTime(lastJob.startedAt)} · {lastJob.renamedFiles}{t('organize.filesRenamed')}
          </p>
        </div>
        {lastJob.status === 'completed' && (
          <button
            onClick={runUndo}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-surface-primary cursor-pointer transition-colors shrink-0"
          >
            <Undo2 className="w-3 h-3" />
            {t('organize.undo')}
          </button>
        )}
        {lastJob.status === 'undone' && (
          <span className="text-xs text-foreground-muted px-2 py-1 bg-surface-primary rounded shrink-0">{t('organize.undone')}</span>
        )}
      </div>
    </div>
  )
}
