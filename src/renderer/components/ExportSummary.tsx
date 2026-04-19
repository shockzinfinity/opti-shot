import { Files, HardDrive, Clock } from 'lucide-react'
import { formatBytes } from '@shared/utils'
import { useTranslation } from '@renderer/hooks/useTranslation'

interface ExportSummaryProps {
  totalFiles: number
  totalSize: number
  loading?: boolean
}

function formatEstTime(totalSize: number): string {
  // Rough estimate: ~100MB/s for local copy
  const seconds = totalSize / (100 * 1024 * 1024)
  if (seconds < 60) return `< 1 min`
  const minutes = Math.ceil(seconds / 60)
  return `~${minutes} min`
}

interface StatProps {
  icon: React.ReactNode
  label: string
  value: string
}

function Stat({ icon, label, value }: StatProps) {
  return (
    <div className="flex flex-col items-center gap-2 py-4">
      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
        {icon}
      </div>
      <p className="text-xs text-foreground-secondary uppercase tracking-wider font-mono">{label}</p>
      <p className="text-2xl font-mono font-bold text-foreground-primary">{value}</p>
    </div>
  )
}

export function ExportSummary({ totalFiles, totalSize, loading = false }: ExportSummaryProps) {
  const { t } = useTranslation()
  const filesValue = loading ? '—' : totalFiles.toLocaleString()
  const sizeValue = loading ? '—' : formatBytes(totalSize)
  const timeValue = loading || totalSize === 0 ? '—' : formatEstTime(totalSize)

  return (
    <div className="bg-surface-secondary rounded-xl p-8">
      <h2 className="text-lg font-heading font-semibold text-foreground-primary mb-4">
        {t('export.summary')}
      </h2>
      <div className="grid grid-cols-3 gap-4 divide-x divide-border">
        <Stat icon={<Files className="w-5 h-5" />} label={t('export.files')} value={filesValue} />
        <Stat icon={<HardDrive className="w-5 h-5" />} label={t('export.size')} value={sizeValue} />
        <Stat icon={<Clock className="w-5 h-5" />} label={t('export.estTime')} value={timeValue} />
      </div>
    </div>
  )
}
