import { AlertTriangle } from 'lucide-react'
import { useDashboardStore, type ScanHistoryItem } from '@renderer/stores/dashboard'
import { useSettingsStore } from '@renderer/stores/settings'
import { useTranslation } from '@renderer/hooks/useTranslation'
import { formatDuration, formatDateCompact } from '@shared/utils'
import { StatusBadge } from './StatusBadge'

function ScanRow({ scan }: { scan: ScanHistoryItem }) {
  const { ui } = useSettingsStore()
  const { t } = useTranslation()

  return (
    <div className="flex items-center gap-3 py-2 border-b border-border/50 last:border-b-0">
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono text-foreground-primary">{formatDateCompact(scan.startedAt, ui.use24HourClock)}</span>
          <StatusBadge status={scan.status} />
          {scan.skippedFiles > 0 && (
            <span className="inline-flex items-center gap-0.5 text-xs text-warning">
              <AlertTriangle className="w-3 h-3" />
              {scan.skippedFiles}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs font-mono text-foreground-muted">
          <span>{scan.totalFiles.toLocaleString()} {t('dashboard.files').toLowerCase()}</span>
          <span>{scan.discoveredGroups} {t('dashboard.groups')}</span>
          <span>{formatDuration(scan.elapsedSeconds)}</span>
        </div>
      </div>
    </div>
  )
}

interface ScanHistoryCardProps {
  className?: string
}

export function ScanHistoryCard({ className = '' }: ScanHistoryCardProps) {
  const { scanHistory, loading } = useDashboardStore()
  const { t } = useTranslation()

  // Don't render if no history or only 1 scan (already shown in RecentScanCard)
  if (loading || scanHistory.length <= 1) return null

  return (
    <div className={`bg-surface-secondary rounded-xl p-6 space-y-3 ${className}`}>
      <h2 className="font-heading font-semibold text-base text-foreground-primary">
        {t('dashboard.scanHistory')}
      </h2>
      <div className="max-h-[240px] overflow-y-auto">
        {scanHistory.map((scan) => (
          <ScanRow key={scan.id} scan={scan} />
        ))}
      </div>
    </div>
  )
}
