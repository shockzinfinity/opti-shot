import { useNavigate } from 'react-router-dom'
import { Play, ArrowRight, Clock, ScanLine } from 'lucide-react'
import { useDashboardStore } from '@renderer/stores/dashboard'
import { useSettingsStore } from '@renderer/stores/settings'
import { useTranslation } from '@renderer/hooks/useTranslation'
import { formatDuration, formatDateLine, formatTimeLine } from '@shared/utils'
import { StatusBadge } from './StatusBadge'

export function RecentScanCard() {
  const navigate = useNavigate()
  const { stats, loading } = useDashboardStore()
  const { ui } = useSettingsStore()
  const { t } = useTranslation()

  const hasData = stats.lastScanStatus !== null

  return (
    <div className="bg-surface-secondary rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ScanLine className="w-4 h-4 text-primary" />
          <h2 className="font-heading font-semibold text-base text-foreground-primary">{t('dashboard.recentScan')}</h2>
        </div>
        {hasData && stats.lastScanStatus && (
          <StatusBadge status={stats.lastScanStatus} />
        )}
      </div>

      {loading && (
        <div className="py-6 flex items-center justify-center">
          <span className="text-sm text-foreground-muted animate-pulse">{t('common.loading')}</span>
        </div>
      )}

      {!loading && !hasData && (
        <div className="py-8 flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="font-semibold text-foreground-primary text-sm">{t('dashboard.noScans')}</p>
            <p className="text-xs text-foreground-muted mt-0.5">{t('dashboard.noScansDesc')}</p>
          </div>
          <button
            onClick={() => navigate('/folders')}
            className="mt-2 flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <Play className="w-4 h-4" />
            {t('dashboard.startFirstScan')}
          </button>
        </div>
      )}

      {!loading && hasData && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-0.5">
              <p className="text-xs text-foreground-muted uppercase tracking-wider font-mono">{t('dashboard.date')}</p>
              <p className="text-sm font-mono text-foreground-primary">
                {stats.lastScanDate ? formatDateLine(stats.lastScanDate) : '—'}
              </p>
              <p className="text-xs font-mono text-foreground-muted">
                {stats.lastScanDate ? formatTimeLine(stats.lastScanDate, ui.use24HourClock) : ''}
              </p>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-foreground-muted uppercase tracking-wider font-mono">{t('dashboard.files')}</p>
              <p className="text-sm font-mono font-bold text-foreground-primary">
                {stats.lastScanFiles.toLocaleString()}
              </p>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-foreground-muted uppercase tracking-wider font-mono">{t('dashboard.duration')}</p>
              <p className="text-sm font-mono font-bold text-foreground-primary">
                {formatDuration(stats.lastScanDuration)}
              </p>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={() => navigate('/review')}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              {t('dashboard.viewResults')}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </>
      )}
    </div>
  )
}
