import { Settings2, ChevronDown, ChevronUp, Hash, Eye, Clock, Cpu, RefreshCcw, Filter, Zap } from 'lucide-react'
import type { ScanOptions, ScanPresetId } from '../stores/folder'
import { SCAN_PRESET_VALUES } from '../stores/folder'
import { PresetSelector } from './PresetSelector'
import { useTranslation } from '@renderer/hooks/useTranslation'

function detectPreset(options: ScanOptions): 'balanced' | 'conservative' | 'sensitive' {
  for (const [id, values] of Object.entries(SCAN_PRESET_VALUES)) {
    if (
      options.phashThreshold === values.phashThreshold &&
      options.ssimThreshold === values.ssimThreshold
    ) {
      return id as ScanPresetId
    }
  }
  return 'balanced'
}

interface AdvancedSettingsProps {
  open: boolean
  options: ScanOptions
  onToggle: () => void
  onOptionChange: <K extends keyof ScanOptions>(key: K, value: ScanOptions[K]) => void
  onPresetChange: (preset: ScanPresetId) => void
}

interface SliderFieldProps {
  icon: React.ReactNode
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onChange: (v: number) => void
}

function SliderField({ icon, label, value, min, max, step, format, onChange }: SliderFieldProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground-primary">
          <span className="text-primary">{icon}</span>
          {label}
        </div>
        <span className="text-sm font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md">
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-surface-secondary rounded-lg appearance-none cursor-pointer accent-primary"
      />
      <div className="flex justify-between text-[10px] text-foreground-muted font-mono">
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </div>
    </div>
  )
}

export function AdvancedSettings({ open, options, onToggle, onOptionChange, onPresetChange }: AdvancedSettingsProps) {
  const { t } = useTranslation()

  return (
    <div className="bg-surface-primary border border-border rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-6 hover:bg-surface-secondary/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Settings2 className="w-5 h-5" />
          </div>
          <div className="text-left">
            <p className="font-semibold text-foreground-primary">{t('advanced.title')}</p>
            <p className="text-xs text-foreground-muted mt-0.5">{t('advanced.subtitle')}</p>
          </div>
        </div>
        {open ? (
          <ChevronUp className="w-5 h-5 text-foreground-muted" />
        ) : (
          <ChevronDown className="w-5 h-5 text-foreground-muted" />
        )}
      </button>

      {open && (
        <div className="px-6 pb-6 border-t border-border pt-6 space-y-6">
          <PresetSelector value={detectPreset(options)} onChange={onPresetChange} />
          <div className="grid grid-cols-2 gap-6">
            <SliderField
              icon={<Hash className="w-4 h-4" />}
              label={t('advanced.phashThreshold')}
              value={options.phashThreshold}
              min={4}
              max={16}
              step={1}
              format={(v) => `${v}`}
              onChange={(v) => onOptionChange('phashThreshold', v)}
            />
            <SliderField
              icon={<Eye className="w-4 h-4" />}
              label={t('advanced.ssimThreshold')}
              value={options.ssimThreshold}
              min={0.5}
              max={0.95}
              step={0.05}
              format={(v) => v.toFixed(2)}
              onChange={(v) => onOptionChange('ssimThreshold', v)}
            />
            <SliderField
              icon={<Clock className="w-4 h-4" />}
              label={t('advanced.timeWindow')}
              value={options.timeWindowHours}
              min={0}
              max={24}
              step={1}
              format={(v) => (v === 0 ? t('advanced.timeWindowOff') : `${v}hr`)}
              onChange={(v) => onOptionChange('timeWindowHours', v)}
            />
            <SliderField
              icon={<Cpu className="w-4 h-4" />}
              label={t('advanced.threads')}
              value={options.parallelThreads}
              min={1}
              max={16}
              step={1}
              format={(v) => `${v}`}
              onChange={(v) => onOptionChange('parallelThreads', v)}
            />
          </div>

          {/* Upcoming features — disabled with "준비 중" */}
          <div className="space-y-2 pt-2">
            <p className="text-xs font-semibold text-foreground-muted uppercase tracking-wider">{t('advanced.upcoming')}</p>
            {[
              { icon: <RefreshCcw className="w-3.5 h-3.5" />, label: t('advanced.correctionDetection'), desc: t('advanced.correctionDetectionDesc') },
              { icon: <Filter className="w-3.5 h-3.5" />, label: t('advanced.exifFiltering'), desc: t('advanced.exifFilteringDesc') },
              { icon: <Zap className="w-3.5 h-3.5" />, label: t('advanced.incrementalScan'), desc: t('advanced.incrementalScanDesc') },
            ].map(({ icon, label, desc }) => (
              <div key={label} className="flex items-center justify-between p-3 rounded-xl bg-surface-secondary/30 opacity-50">
                <div className="flex items-center gap-2.5">
                  <span className="text-foreground-muted">{icon}</span>
                  <div>
                    <p className="text-sm font-semibold text-foreground-muted">{label}</p>
                    <p className="text-xs text-foreground-muted/70 mt-0.5">{desc}</p>
                  </div>
                </div>
                <span className="text-[10px] font-mono font-semibold text-foreground-muted bg-surface-secondary px-2 py-0.5 rounded-full">
                  {t('advanced.comingSoon')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
