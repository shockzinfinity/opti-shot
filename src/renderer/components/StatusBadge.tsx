import { useTranslation } from '@renderer/hooks/useTranslation'
import { SCAN_STATUS } from '@shared/types'

const STATUS_MAP: Record<string, { labelKey: string; className: string }> = {
  [SCAN_STATUS.COMPLETED]: { labelKey: 'status.completed', className: 'bg-success-light text-success' },
  [SCAN_STATUS.FAILED]: { labelKey: 'status.failed', className: 'bg-error-light text-error' },
  [SCAN_STATUS.RUNNING]: { labelKey: 'status.running', className: 'bg-primary-light text-primary' },
  [SCAN_STATUS.PAUSED]: { labelKey: 'status.paused', className: 'bg-warning-light text-warning' },
  [SCAN_STATUS.CANCELLED]: { labelKey: 'status.cancelled', className: 'bg-surface-secondary text-foreground-muted' },
}

export function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation()
  const config = STATUS_MAP[status]
  const label = config ? t(config.labelKey as Parameters<typeof t>[0]) : status
  const className = config?.className ?? 'bg-surface-secondary text-foreground-muted'
  return (
    <span className={`text-xs font-mono font-semibold px-2 py-0.5 rounded-full ${className}`}>
      {label}
    </span>
  )
}
