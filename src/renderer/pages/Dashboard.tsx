import { useEffect } from 'react'
import { Image, Layers, HardDrive } from 'lucide-react'
import { useDashboardStore } from '@renderer/stores/dashboard'
import { RecentScanCard } from '@renderer/components/RecentScanCard'
import { RecentOrganizeCard } from '@renderer/components/RecentOrganizeCard'
import { QuickActions } from '@renderer/components/QuickActions'
import { formatBytes, formatNumber as formatCount } from '@shared/utils'
import { useTranslation } from '@renderer/hooks/useTranslation'

interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: string
  unit: string
}

function StatCard({ icon, label, value, unit }: StatCardProps) {
  return (
    <div className="bg-surface-secondary rounded-xl p-5 space-y-2">
      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
        {icon}
      </div>
      <p className="text-sm text-foreground-secondary">{label}</p>
      <p className="text-[28px] font-mono font-bold leading-tight">{value}</p>
      <p className="text-xs text-foreground-muted font-mono uppercase tracking-wider">{unit}</p>
    </div>
  )
}

export function Dashboard() {
  const { stats, loading, loadStats } = useDashboardStore()
  const { t } = useTranslation()

  useEffect(() => {
    loadStats()
  }, [loadStats])

  const displayPhotos = loading ? '—' : formatCount(stats.totalPhotos)
  const displayGroups = loading ? '—' : formatCount(stats.totalGroups)
  const displaySize = loading ? '—' : (stats.reclaimableSize === 0 ? '—' : formatBytes(stats.reclaimableSize))

  return (
    <div className="max-w-4xl mx-auto p-8 space-y-8">
      {/* Welcome section */}
      <div>
        <h1 className="text-[28px] font-heading font-bold">{t('dashboard.welcome')}</h1>
        <p className="text-foreground-secondary mt-1">{t('dashboard.subtitle')}</p>
      </div>

      {/* 3 Stat Cards */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          icon={<Image className="w-5 h-5" />}
          label={t('dashboard.totalPhotos')}
          value={displayPhotos}
          unit={t('dashboard.filesScanned')}
        />
        <StatCard
          icon={<Layers className="w-5 h-5" />}
          label={t('dashboard.duplicateGroups')}
          value={displayGroups}
          unit={t('dashboard.groupsFound')}
        />
        <StatCard
          icon={<HardDrive className="w-5 h-5" />}
          label={t('dashboard.reclaimableSpace')}
          value={displaySize}
          unit={t('dashboard.potentialSavings')}
        />
      </div>

      {/* Recent Activity + Quick Actions */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        <div className="xl:col-span-2 space-y-4">
          <RecentScanCard />
          <RecentOrganizeCard />
        </div>
        <QuickActions />
      </div>

    </div>
  )
}
