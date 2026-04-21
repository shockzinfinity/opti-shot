import { Clock } from 'lucide-react'
import type { ScanMode } from '@shared/types'
import { useTranslation } from '@renderer/hooks/useTranslation'
import type { TranslationKey } from '@renderer/i18n'

interface ScanModeSelectorProps {
  mode: ScanMode
  dateStart: string | null
  dateEnd: string | null
  onModeChange: (mode: ScanMode) => void
  onDateStartChange: (value: string | null) => void
  onDateEndChange: (value: string | null) => void
}

const MODES: { value: ScanMode; labelKey: TranslationKey; descKey: TranslationKey }[] = [
  { value: 'full', labelKey: 'folders.fullScan', descKey: 'folders.fullScanDesc' },
  { value: 'date_range', labelKey: 'folders.dateRange', descKey: 'folders.dateRangeDesc' },
  { value: 'folder_only', labelKey: 'folders.folderOnly', descKey: 'folders.folderOnlyDesc' },
]

export function ScanModeSelector({
  mode,
  dateStart,
  dateEnd,
  onModeChange,
  onDateStartChange,
  onDateEndChange,
}: ScanModeSelectorProps) {
  const isDateRange = mode === 'date_range'
  const { t } = useTranslation()

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* Left: Mode radio buttons */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground-primary">{t('folders.scanMode')}</h3>
        <div className="space-y-2">
          {MODES.map((m) => (
            <label
              key={m.value}
              className="flex items-start gap-3 p-3 rounded-xl cursor-pointer hover:bg-surface-secondary transition-colors group"
            >
              <div className="mt-0.5 relative">
                <input
                  type="radio"
                  name="scan-mode"
                  value={m.value}
                  checked={mode === m.value}
                  onChange={() => onModeChange(m.value)}
                  className="sr-only"
                />
                <div
                  className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                    mode === m.value
                      ? 'border-primary bg-primary'
                      : 'border-border-strong group-hover:border-primary/60'
                  }`}
                >
                  {mode === m.value && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
              </div>
              <div>
                <p className={`text-sm font-semibold ${mode === m.value ? 'text-primary' : 'text-foreground-primary'}`}>
                  {t(m.labelKey)}
                </p>
                <p className="text-xs text-foreground-muted mt-0.5">{t(m.descKey)}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Right: Time filter date inputs */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground-primary flex items-center gap-2">
          <Clock className="w-4 h-4" />
          {t('folders.timeFilter')}
        </h3>
        <div
          className={`space-y-4 p-4 rounded-xl border transition-all ${
            isDateRange
              ? 'border-border bg-surface-secondary/50'
              : 'border-border/50 bg-surface-secondary/20 opacity-50'
          }`}
        >
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground-secondary uppercase tracking-wider">
              {t('folders.from')}
            </label>
            <input
              type="date"
              disabled={!isDateRange}
              value={dateStart ?? ''}
              onChange={(e) => onDateStartChange(e.target.value || null)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-surface-primary text-sm font-mono text-foreground-primary disabled:cursor-not-allowed disabled:text-foreground-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground-secondary uppercase tracking-wider">
              {t('folders.to')}
            </label>
            <input
              type="date"
              disabled={!isDateRange}
              value={dateEnd ?? ''}
              onChange={(e) => onDateEndChange(e.target.value || null)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-surface-primary text-sm font-mono text-foreground-primary disabled:cursor-not-allowed disabled:text-foreground-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
            />
          </div>
          {!isDateRange && (
            <p className="text-xs text-foreground-muted italic">{t('folders.enableDateRange')}</p>
          )}
        </div>
      </div>
    </div>
  )
}
