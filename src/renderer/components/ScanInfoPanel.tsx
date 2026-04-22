import { useEffect, useState } from 'react'
import { ScanSearch, Puzzle, Clock, Settings2 } from 'lucide-react'
import { useTranslation } from '@renderer/hooks/useTranslation'
import { SidePanel, PanelSection, PanelRow, PanelEmpty } from './SidePanel'
import { detectPreset } from '@shared/constants'
import { formatDuration, formatDateTime } from '@shared/utils'
import type { AlgorithmInfo } from '@shared/plugins'
import type { ScanRecord } from '@shared/types'

interface ScanInfoPanelProps {
  onClose: () => void
}

const PRESET_LABELS: Record<string, string> = {
  balanced: 'Balanced (균형)',
  fast: 'Fast (빠른)',
  conservative: 'Conservative (보수적)',
  precise: 'Precise (정밀)',
  custom: 'Custom (사용자 정의)',
}

export function ScanInfoPanel({ onClose }: ScanInfoPanelProps) {
  const [scan, setScan] = useState<ScanRecord | null>(null)
  const [algorithms, setAlgorithms] = useState<AlgorithmInfo[]>([])
  const [loading, setLoading] = useState(true)
  const { t } = useTranslation()

  useEffect(() => {
    Promise.all([
      window.electron.query('stats.dashboard'),
      window.electron.query('algorithm.list'),
    ]).then(([dashRes, algoRes]) => {
      if (dashRes.success) {
        const data = dashRes.data as { lastScan: ScanRecord | null }
        setScan(data.lastScan)
      }
      if (algoRes.success) {
        setAlgorithms(algoRes.data as unknown as AlgorithmInfo[])
      }
      setLoading(false)
    })
  }, [])

  return (
    <SidePanel
      title={<h2 className="text-sm font-bold text-foreground-primary">{t('scanInfo.title')}</h2>}
      icon={<ScanSearch className="w-4 h-4" />}
      onClose={onClose}
    >
      {loading ? (
        <PanelEmpty message={t('common.loading')} />
      ) : !scan ? (
        <PanelEmpty message={t('scanInfo.noScan')} />
      ) : (
        <div className="divide-y divide-border">
          <PanelSection icon={<Clock className="w-3.5 h-3.5" />} title={t('scanInfo.summary')}>
            <PanelRow label={t('scanInfo.startedAt')} value={formatDateTime(scan.startedAt)} />
            {scan.endedAt && <PanelRow label={t('scanInfo.endedAt')} value={formatDateTime(scan.endedAt)} />}
            <PanelRow label={t('scanInfo.duration')} value={formatDuration(scan.elapsedSeconds)} />
            <PanelRow label={t('scanInfo.mode')} value={t(`scanInfo.mode.${scan.optionMode}` as any) || scan.optionMode} />
            <PanelRow label={t('scanInfo.totalFiles')} value={String(scan.totalFiles)} />
            <PanelRow label={t('scanInfo.processedFiles')} value={String(scan.processedFiles)} />
            <PanelRow label={t('scanInfo.discoveredGroups')} value={String(scan.discoveredGroups)} />
            {scan.skippedFiles > 0 && (
              <PanelRow label={t('scanInfo.skippedFiles')} value={String(scan.skippedFiles)} />
            )}
          </PanelSection>

          <PanelSection icon={<Settings2 className="w-3.5 h-3.5" />} title={t('scanInfo.parameters')}>
            <PanelRow
              label={t('scanInfo.preset')}
              value={(() => {
                // Reconstruct AlgorithmConfig from legacy scan record fields
                const config = {
                  hashAlgorithms: ['phash'],
                  hashThresholds: { phash: scan.optionPhashThreshold },
                  mergeStrategy: 'union' as const,
                  verifyAlgorithms: ['ssim'],
                  verifyThresholds: { ssim: scan.optionSsimThreshold },
                }
                const p = detectPreset(config)
                return PRESET_LABELS[p] ?? p
              })()}
              highlight
            />
            <PanelRow label={t('scanInfo.phashThreshold')} value={String(scan.optionPhashThreshold)} />
            <PanelRow label={t('scanInfo.ssimThreshold')} value={scan.optionSsimThreshold.toFixed(2)} />
            <PanelRow label={t('scanInfo.timeWindow')} value={scan.optionTimeWindowHours === 0 ? t('scanInfo.off') : `${scan.optionTimeWindowHours}hr`} />
            <PanelRow label={t('scanInfo.threads')} value={String(scan.optionParallelThreads)} />
          </PanelSection>

          <PanelSection icon={<Puzzle className="w-3.5 h-3.5" />} title={t('scanInfo.plugins')}>
            {algorithms.length === 0 ? (
              <span className="text-xs text-foreground-muted">{t('scanInfo.noPlugins')}</span>
            ) : (
              algorithms.map((a) => (
                <div key={a.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-foreground-primary font-semibold">{a.name}</span>
                    <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-primary/10 text-primary">
                      {a.stage === 'hash' ? 'Stage 1' : 'Stage 2'}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-foreground-muted">v{a.version}</span>
                </div>
              ))
            )}
          </PanelSection>
        </div>
      )}
    </SidePanel>
  )
}
