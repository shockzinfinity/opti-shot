import { formatTime, formatNumber, formatSpeed } from '@shared/utils'
import { useTranslation } from '@renderer/hooks/useTranslation'

export interface ScanStatsProps {
  processedFiles: number
  totalFiles: number
  discoveredGroups: number
  elapsedSeconds: number
  estimatedRemainingSeconds: number
  scanSpeed: number
}

interface StatItemProps {
  label: string
  value: string
}

function StatItem({ label, value }: StatItemProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-widest text-foreground-muted font-body">
        {label}
      </span>
      <span className="font-mono text-xl font-bold text-foreground-primary">{value}</span>
    </div>
  )
}

export function ScanStats({
  processedFiles,
  totalFiles,
  discoveredGroups,
  elapsedSeconds,
  estimatedRemainingSeconds,
  scanSpeed,
}: ScanStatsProps) {
  const { t } = useTranslation()
  const processed = `${formatNumber(processedFiles)} / ${formatNumber(totalFiles)}`
  const groups = formatNumber(discoveredGroups)
  const elapsed = formatTime(elapsedSeconds)
  const eta = estimatedRemainingSeconds > 0 ? `~${formatTime(estimatedRemainingSeconds)}` : '—'

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-8 gap-y-4">
        <StatItem label={t('scan.processed')} value={processed} />
        <StatItem label={t('scan.groupsFound')} value={groups} />
        <StatItem label={t('scan.elapsedTime')} value={elapsed} />
        <StatItem label={t('scan.eta')} value={eta} />
      </div>
      <div className="pt-2 border-t border-border">
        <span className="text-sm text-foreground-secondary font-mono">
          {formatSpeed(scanSpeed)}
        </span>
      </div>
    </div>
  )
}
