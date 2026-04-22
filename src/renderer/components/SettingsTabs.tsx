import { useState, useEffect, type ReactNode } from 'react'
import { clearThumbnailCache } from '@renderer/hooks/useThumbnail'
import { formatBytes } from '@shared/utils'
// AlgorithmInfo loaded via algorithm.list query
import {
  ScanSearch,
  Palette,
  Database,
  Info,
  Filter,
  RefreshCcw,
  Check,
  Bell,
  Sun,
  Moon,
  Monitor,
  Minimize2,
  Maximize2,
  Globe,
  Trash2,
  Clock,
  Puzzle,
  HelpCircle,
} from 'lucide-react'
import { useSettingsStore } from '@renderer/stores/settings'
import { useTranslation } from '@renderer/hooks/useTranslation'
import { PresetSelector } from './PresetSelector'
import { SettingsSlider } from './SettingsSlider'

// --- Toggle Switch ---

interface ToggleProps {
  on: boolean
  onToggle: () => void
  label: string
}

function Toggle({ on, onToggle, label }: ToggleProps) {
  return (
    <button
      onClick={onToggle}
      className={`w-12 h-6 rounded-full relative flex items-center px-1 transition-colors ${on ? 'bg-primary' : 'bg-border'}`}
      role="switch"
      aria-checked={on}
      aria-label={`Toggle ${label}`}
    >
      <div
        className={`w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${on ? 'translate-x-6' : 'translate-x-0'}`}
      />
    </button>
  )
}

// --- Toggle Card ---

interface ToggleCardProps {
  icon: ReactNode
  label: string
  description: string
  value: boolean
  onToggle: () => void
}

function ToggleCard({ icon, label, description, value, onToggle }: ToggleCardProps) {
  return (
    <div className="flex items-center justify-between p-4 bg-surface-secondary rounded-xl">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
          {icon}
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground-primary">{label}</p>
          <p className="text-xs text-foreground-muted">{description}</p>
        </div>
      </div>
      <Toggle on={value} onToggle={onToggle} label={label} />
    </div>
  )
}

// --- Section Header ---

function SectionHeader({ title }: { title: string }) {
  return <h3 className="text-base font-heading font-semibold text-foreground-primary">{title}</h3>
}

// --- Info Tooltip ---

function InfoTooltip({ text }: { text: string }) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative inline-block">
      <button
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        className="w-5 h-5 rounded-full border border-border text-foreground-muted hover:text-primary hover:border-primary flex items-center justify-center transition-colors"
        aria-label="More info"
        type="button"
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
      {visible && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-72 p-3 rounded-lg bg-foreground-primary text-surface-primary text-xs leading-relaxed shadow-lg z-50 whitespace-pre-line">
          {text}
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 bg-foreground-primary rotate-45 -mt-1" />
        </div>
      )}
    </div>
  )
}

// ============================
// SCAN TAB
// ============================

export function ScanTab() {
  const { scan, updateScan, applyPreset } = useSettingsStore()
  const { t } = useTranslation()
  const [algorithms, setAlgorithms] = useState<Array<{ id: string; name: string; description: string; detailDescription: string; version: string; stage: 'hash' | 'verify' }>>([])

  useEffect(() => {
    window.electron.query('algorithm.list').then((res) => {
      if (res.success) setAlgorithms(res.data as typeof algorithms)
    })
  }, [])

  const isAlgoEnabled = (algo: { id: string; stage: 'hash' | 'verify' }) => {
    return algo.stage === 'hash'
      ? scan.hashAlgorithms.includes(algo.id)
      : scan.verifyAlgorithms.includes(algo.id)
  }

  const handleAlgoToggle = (algo: { id: string; stage: 'hash' | 'verify' }) => {
    if (algo.stage === 'hash') {
      const current = scan.hashAlgorithms
      const updated = current.includes(algo.id)
        ? current.filter((id) => id !== algo.id)
        : [...current, algo.id]
      if (updated.length === 0) return // at least one hash required
      updateScan('hashAlgorithms', updated)
    } else {
      const current = scan.verifyAlgorithms
      const updated = current.includes(algo.id)
        ? current.filter((id) => id !== algo.id)
        : [...current, algo.id]
      updateScan('verifyAlgorithms', updated)
    }
    updateScan('preset', 'custom')
  }

  const hashAlgos = algorithms.filter((a) => a.stage === 'hash')
  const verifyAlgos = algorithms.filter((a) => a.stage === 'verify')

  return (
    <div className="space-y-8">
      {/* Scanning Presets — 최상단 */}
      <div className="space-y-3">
        <SectionHeader title={t('settings.scanPresets')} />
        <p className="text-sm text-foreground-muted">{t('settings.scanPresetsDesc')}</p>
        <PresetSelector value={scan.preset} onChange={(p) => { if (p !== 'custom') applyPreset(p) }} />
      </div>

      {/* Detection Algorithms */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Puzzle className="w-4 h-4 text-primary" />
          <SectionHeader title={t('settings.detectionAlgorithms')} />
        </div>
        <p className="text-sm text-foreground-muted">{t('settings.detectionAlgorithmsDesc')}</p>

        {/* Stage 1: Hash Algorithms */}
        {hashAlgos.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground-muted uppercase tracking-wider">Stage 1 — {t('settings.hashAlgorithms')}</p>
            <div className="space-y-2">
              {hashAlgos.map((algo) => {
                const enabled = isAlgoEnabled(algo)
                const threshold = scan.hashThresholds[algo.id]
                return (
                  <div key={algo.id} className="bg-surface-secondary rounded-xl">
                    <div className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                          <Puzzle className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-foreground-primary">{algo.name}</p>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-border text-foreground-muted">
                              v{algo.version}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <p className="text-xs text-foreground-muted">{algo.description}</p>
                            {algo.detailDescription && (
                              <InfoTooltip text={algo.detailDescription} />
                            )}
                          </div>
                        </div>
                      </div>
                      <Toggle
                        on={enabled}
                        onToggle={() => handleAlgoToggle(algo)}
                        label={algo.name}
                      />
                    </div>
                    {enabled && threshold != null && (
                      <div className="px-4 pb-4 pt-0">
                        <SettingsSlider
                          label={t('settings.threshold')}
                          value={threshold}
                          min={2}
                          max={20}
                          step={1}
                          format={(v) => `${v}`}
                          onChange={(v) => {
                            updateScan('hashThresholds', { ...scan.hashThresholds, [algo.id]: v })
                            updateScan('preset', 'custom')
                          }}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Stage 2: Verify Algorithms */}
        {verifyAlgos.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground-muted uppercase tracking-wider">Stage 2 — {t('settings.verifyAlgorithms')}</p>
            <div className="space-y-2">
              {verifyAlgos.map((algo) => {
                const enabled = isAlgoEnabled(algo)
                const threshold = scan.verifyThresholds[algo.id]
                return (
                  <div key={algo.id} className="bg-surface-secondary rounded-xl">
                    <div className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                          <Puzzle className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-foreground-primary">{algo.name}</p>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-border text-foreground-muted">
                              v{algo.version}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <p className="text-xs text-foreground-muted">{algo.description}</p>
                            {algo.detailDescription && (
                              <InfoTooltip text={algo.detailDescription} />
                            )}
                          </div>
                        </div>
                      </div>
                      <Toggle
                        on={enabled}
                        onToggle={() => handleAlgoToggle(algo)}
                        label={algo.name}
                      />
                    </div>
                    {enabled && threshold != null && (
                      <div className="px-4 pb-4 pt-0">
                        <SettingsSlider
                          label={t('settings.threshold')}
                          value={threshold}
                          min={0.01}
                          max={1}
                          step={0.01}
                          format={(v) => v.toFixed(2)}
                          onChange={(v) => {
                            updateScan('verifyThresholds', { ...scan.verifyThresholds, [algo.id]: v })
                            updateScan('preset', 'custom')
                          }}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Performance Parameters */}
      <div className="bg-surface-secondary p-8 rounded-xl space-y-6">
        <div className="flex items-center gap-2">
          <ScanSearch className="w-4 h-4 text-primary" />
          <SectionHeader title={t('settings.performanceParams')} />
        </div>

        <SettingsSlider
          label={t('settings.timeWindow')}
          value={scan.timeWindowHours}
          min={0}
          max={24}
          step={1}
          format={(v) => (v === 0 ? t('settings.timeWindowOff') : `${v}hr`)}
          onChange={(v) => updateScan('timeWindowHours', v)}
        />
        <SettingsSlider
          label={t('settings.parallelThreads')}
          value={scan.parallelThreads}
          min={1}
          max={16}
          step={1}
          format={(v) => `${v}`}
          onChange={(v) => updateScan('parallelThreads', v)}
        />

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-body text-foreground-primary">{t('settings.batchSize')}</span>
            <span className="text-sm font-mono font-semibold text-primary min-w-[3rem] text-right">
              {scan.batchSize}
            </span>
          </div>
          <input
            type="number"
            min={10}
            max={1000}
            step={10}
            value={scan.batchSize}
            onChange={(e) => updateScan('batchSize', Number(e.target.value))}
            className="w-full px-3 py-2 rounded-lg border border-border bg-surface-primary text-foreground-primary text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
      </div>

      {/* Advanced Processing */}
      <div className="space-y-3">
        <SectionHeader title={t('settings.advancedProcessing')} />
        <div className="space-y-3">
          <ToggleCard
            icon={<Filter className="w-4 h-4" />}
            label={t('settings.exifFiltering')}
            description={t('settings.exifFilteringDesc')}
            value={scan.enableExifFilter}
            onToggle={() => updateScan('enableExifFilter', !scan.enableExifFilter)}
          />
        </div>
      </div>
    </div>
  )
}

// ============================
// UI TAB
// ============================

type Theme = 'light' | 'dark' | 'auto'

const LANGUAGES: { id: 'ko' | 'en' | 'ja'; label: string }[] = [
  { id: 'ko', label: '한국어' },
  { id: 'en', label: 'English' },
  { id: 'ja', label: '日本語' },
]

export function UITab() {
  const { ui, updateUi } = useSettingsStore()
  const { t } = useTranslation()

  const THEMES: { id: Theme; label: string; icon: ReactNode }[] = [
    { id: 'light', label: t('settings.themeLight'), icon: <Sun className="w-4 h-4" /> },
    { id: 'dark', label: t('settings.themeDark'), icon: <Moon className="w-4 h-4" /> },
    { id: 'auto', label: t('settings.themeAuto'), icon: <Monitor className="w-4 h-4" /> },
  ]

  return (
    <div className="space-y-8">
      {/* Language */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-primary" />
          <SectionHeader title={t('settings.language')} />
        </div>
        <div className="flex gap-3">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.id}
              onClick={() => updateUi('language', lang.id)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all border-2 ${
                ui.language === lang.id
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-transparent bg-surface-secondary text-foreground-secondary hover:border-border'
              }`}
            >
              {lang.label}
            </button>
          ))}
        </div>
      </div>

      {/* Theme */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-primary" />
          <SectionHeader title={t('settings.theme')} />
        </div>
        <div className="grid grid-cols-3 gap-4">
          {THEMES.map((theme) => {
            const isActive = ui.theme === theme.id
            return (
              <button
                key={theme.id}
                onClick={() => updateUi('theme', theme.id)}
                className={`p-4 rounded-xl text-left transition-all border-2 ${
                  isActive
                    ? 'border-primary bg-primary/5'
                    : 'border-transparent bg-surface-secondary hover:border-border'
                }`}
              >
                <div className={`mb-2 ${isActive ? 'text-primary' : 'text-foreground-muted'}`}>{theme.icon}</div>
                <span className={`text-sm font-semibold ${isActive ? 'text-primary' : 'text-foreground-primary'}`}>
                  {theme.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Notification & Window toggles */}
      <div className="space-y-3">
        <SectionHeader title={t('settings.behavior')} />
        <div className="space-y-3">
          <ToggleCard
            icon={<Clock className="w-4 h-4" />}
            label={t('settings.use24HourClock')}
            description={t('settings.use24HourClockDesc')}
            value={ui.use24HourClock}
            onToggle={() => updateUi('use24HourClock', !ui.use24HourClock)}
          />
          <ToggleCard
            icon={<Bell className="w-4 h-4" />}
            label={t('settings.notifyOnComplete')}
            description={t('settings.notifyOnCompleteDesc')}
            value={ui.notifyOnComplete}
            onToggle={() => updateUi('notifyOnComplete', !ui.notifyOnComplete)}
          />
          <ToggleCard
            icon={<Minimize2 className="w-4 h-4" />}
            label={t('settings.minimizeToTray')}
            description={t('settings.minimizeToTrayDesc')}
            value={ui.minimizeToTray}
            onToggle={() => updateUi('minimizeToTray', !ui.minimizeToTray)}
          />
          <ToggleCard
            icon={<Maximize2 className="w-4 h-4" />}
            label={t('settings.restoreWindowSize')}
            description={t('settings.restoreWindowSizeDesc')}
            value={ui.restoreWindowSize}
            onToggle={() => updateUi('restoreWindowSize', !ui.restoreWindowSize)}
          />
        </div>
      </div>
    </div>
  )
}

// ============================
// DATA TAB
// ============================


export function DataTab() {
  const { data, updateData } = useSettingsStore()
  const { t } = useTranslation()
  const [storageStats, setStorageStats] = useState<{ dbSize: number; cacheSize: number }>({ dbSize: 0, cacheSize: 0 })

  useEffect(() => {
    window.electron.query('maintenance.storageStats').then((res) => {
      if (res.success) setStorageStats(res.data as { dbSize: number; cacheSize: number })
    })
  }, [])

  const handleClearCache = async () => {
    const res = await window.electron.command('maintenance.clearCache')
    if (res.success) {
      setStorageStats((s) => ({ ...s, cacheSize: 0 }))
      alert(t('settings.cacheCleared'))
    }
  }

  const handleClearScanHistory = async () => {
    if (!confirm(t('settings.clearScanHistoryConfirm'))) return
    const res = await window.electron.command('maintenance.clearScanHistory')
    if (res.success) {
      clearThumbnailCache()
      setStorageStats({ dbSize: 0, cacheSize: 0 })
      alert(t('settings.scanHistoryCleared'))
    }
  }

  const handleClearOrganizeHistory = async () => {
    if (!confirm(t('settings.clearOrganizeHistoryConfirm'))) return
    const res = await window.electron.command('maintenance.clearOrganizeHistory')
    if (res.success) {
      alert(t('settings.organizeHistoryCleared'))
    }
  }

  return (
    <div className="space-y-8">
      {/* Trash Retention */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-primary" />
          <SectionHeader title={t('settings.trashRetention')} />
        </div>
        <div className="bg-surface-secondary p-6 rounded-xl">
          <SettingsSlider
            label={t('settings.retentionPeriod')}
            value={data.trashRetentionDays}
            min={7}
            max={90}
            step={1}
            format={(v) => `${v} days`}
            onChange={(v) => updateData('trashRetentionDays', v)}
          />
        </div>
      </div>

      {/* Toggles */}
      <div className="space-y-3">
        <SectionHeader title={t('settings.automation')} />
        <ToggleCard
          icon={<RefreshCcw className="w-4 h-4" />}
          label={t('settings.autoCacheCleanup')}
          description={t('settings.autoCacheCleanupDesc')}
          value={data.autoCacheCleanup}
          onToggle={() => updateData('autoCacheCleanup', !data.autoCacheCleanup)}
        />
        <ToggleCard
          icon={<Trash2 className="w-4 h-4" />}
          label={t('settings.useSystemTrash')}
          description={t('settings.useSystemTrashDesc')}
          value={data.useSystemTrash}
          onToggle={() => updateData('useSystemTrash', !data.useSystemTrash)}
        />
      </div>

      {/* Actions */}
      <div className="space-y-3">
        <SectionHeader title={t('settings.maintenance')} />
        <div className="flex gap-3">
          <button
            onClick={handleClearScanHistory}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-surface-secondary border border-error/20 text-error hover:bg-error-light transition-colors"
          >
            {t('settings.clearScanHistory')}
          </button>
          <button
            onClick={handleClearOrganizeHistory}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-surface-secondary border border-error/20 text-error hover:bg-error-light transition-colors"
          >
            {t('settings.clearOrganizeHistory')}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="space-y-3">
        <SectionHeader title={t('settings.storageStats')} />
        <div className="bg-surface-secondary rounded-xl divide-y divide-border">
          {[
            { labelKey: 'settings.dbSize' as const, value: formatBytes(storageStats.dbSize) },
            { labelKey: 'settings.cacheSize' as const, value: formatBytes(storageStats.cacheSize) },
          ].map(({ labelKey, value }) => (
            <div key={labelKey} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-foreground-secondary">{t(labelKey)}</span>
              <span className="text-sm font-mono text-foreground-primary">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ============================
// INFO TAB
// ============================

type UpdaterStatus = 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'downloaded' | 'error'

export function InfoTab() {
  const { t } = useTranslation()
  const [info, setInfo] = useState<Record<string, string>>({})
  const [updaterStatus, setUpdaterStatus] = useState<UpdaterStatus>('idle')
  const [updateVersion, setUpdateVersion] = useState('')
  const [downloadPercent, setDownloadPercent] = useState(0)

  useEffect(() => {
    window.electron.query('app.info')
      .then((res) => { if (res.success) setInfo(res.data as unknown as Record<string, string>) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const unsubs = [
      window.electron.subscribe('updater.available', (data) => {
        const { version } = data as { version: string }
        setUpdateVersion(version)
        setUpdaterStatus('available')
      }),
      window.electron.subscribe('updater.progress', (data) => {
        const { percent } = data as { percent: number }
        setDownloadPercent(Math.round(percent))
        setUpdaterStatus('downloading')
      }),
      window.electron.subscribe('updater.downloaded', () => {
        setUpdaterStatus('downloaded')
      }),
    ]
    return () => unsubs.forEach((fn) => fn())
  }, [])

  const handleCheckUpdate = async () => {
    setUpdaterStatus('checking')
    try {
      const res = await window.electron.command('updater.check')
      if (res.success && res.data) {
        const updateInfo = res.data as { version?: string }
        if (updateInfo.version) {
          setUpdateVersion(updateInfo.version)
          setUpdaterStatus('available')
        } else {
          setUpdaterStatus('up-to-date')
        }
      } else {
        setUpdaterStatus('up-to-date')
      }
    } catch {
      setUpdaterStatus('error')
    }
  }

  const handleDownload = () => {
    setUpdaterStatus('downloading')
    setDownloadPercent(0)
    window.electron.command('updater.download')
  }

  const handleInstall = () => {
    window.electron.command('updater.install')
  }

  const rows = [
    { labelKey: 'settings.version' as const, value: info.version ?? '—' },
    { labelKey: 'settings.platform' as const, value: info.platform ?? '—' },
    { labelKey: 'settings.electron' as const, value: info.electron ?? '—' },
    { labelKey: 'settings.node' as const, value: info.node ?? '—' },
    { labelKey: 'settings.chrome' as const, value: info.chrome ?? '—' },
    { labelKey: 'settings.license' as const, value: 'MIT' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
          <Info className="w-6 h-6" />
        </div>
        <div>
          <p className="text-lg font-heading font-bold text-foreground-primary">OptiShot</p>
          <p className="text-sm text-foreground-muted">{t('settings.appDesc')}</p>
        </div>
      </div>

      <div className="bg-surface-secondary rounded-xl divide-y divide-border">
        {rows.map(({ labelKey, value }) => (
          <div key={labelKey} className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-foreground-secondary">{t(labelKey)}</span>
            <span className="text-sm font-mono text-foreground-primary">{value}</span>
          </div>
        ))}
      </div>

      {/* Software Update */}
      <div className="space-y-3">
        <SectionHeader title={t('updater.title')} />
        <div className="bg-surface-secondary rounded-xl p-4 space-y-3">
          {/* Check button row — always visible */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              {updaterStatus === 'checking' && (
                <>
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <span className="text-foreground-muted">{t('updater.checking')}</span>
                </>
              )}
              {updaterStatus === 'up-to-date' && (
                <>
                  <Check className="w-4 h-4 text-success" />
                  <span className="text-success">{t('updater.upToDate')}</span>
                </>
              )}
              {updaterStatus === 'available' && (
                <span className="text-primary font-semibold">
                  {t('updater.availableDesc').replace('{version}', updateVersion)}
                </span>
              )}
              {updaterStatus === 'error' && (
                <span className="text-error">{t('updater.error')}</span>
              )}
            </div>
            <button
              onClick={handleCheckUpdate}
              disabled={updaterStatus === 'checking' || updaterStatus === 'downloading'}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('updater.checkForUpdates')}
            </button>
          </div>

          {/* Download / Progress / Install — shown below when applicable */}
          {updaterStatus === 'available' && (
            <button
              onClick={handleDownload}
              className="w-full px-4 py-2 rounded-lg text-sm font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
            >
              {t('updater.download')}
            </button>
          )}

          {updaterStatus === 'downloading' && (
            <div className="space-y-2">
              <p className="text-sm text-foreground-muted">
                {t('updater.downloading').replace('{percent}', String(downloadPercent))}
              </p>
              <div className="w-full h-2 bg-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${downloadPercent}%` }}
                />
              </div>
            </div>
          )}

          {updaterStatus === 'downloaded' && (
            <div className="flex items-center justify-between p-3 bg-success/10 rounded-lg">
              <div>
                <p className="text-sm font-semibold text-foreground-primary">{t('updater.downloaded')}</p>
                <p className="text-xs text-foreground-muted">{t('updater.installDesc')}</p>
              </div>
              <button
                onClick={handleInstall}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-success text-white hover:bg-success/90 transition-colors"
              >
                {t('updater.install')}
              </button>
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-foreground-muted leading-relaxed">
        {t('settings.privacyNote')}
      </p>
    </div>
  )
}
