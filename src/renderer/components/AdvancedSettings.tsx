import { Settings2, ChevronDown, ChevronUp, Hash, Eye, Clock, Cpu, Puzzle } from 'lucide-react'
import type { ScanOptions, ScanPresetId } from '../stores/folder'
import type { PluginInfo } from '@shared/plugins'
import type { TranslationKey } from '@renderer/i18n'
import { detectPreset } from '@shared/constants'
import { PresetSelector } from './PresetSelector'
import { useTranslation } from '@renderer/hooks/useTranslation'

interface AdvancedSettingsProps {
  open: boolean
  options: ScanOptions
  plugins: PluginInfo[]
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

function PluginSection({ plugin, options, onOptionChange, onPresetChange, t }: {
  plugin: PluginInfo
  options: ScanOptions
  onOptionChange: <K extends keyof ScanOptions>(key: K, value: ScanOptions[K]) => void
  onPresetChange: (preset: ScanPresetId) => void
  t: (key: TranslationKey) => string
}) {
  // pHash+SSIM plugin gets preset selector + 4 sliders
  if (plugin.id === 'phash-ssim') {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          <Puzzle className="w-4 h-4 text-primary" />
          <p className="text-sm font-semibold text-foreground-primary">{plugin.name}</p>
          <span className="text-[10px] font-mono text-foreground-muted bg-surface-secondary px-1.5 py-0.5 rounded">v{plugin.version}</span>
        </div>
        <p className="text-xs text-foreground-muted -mt-3">{plugin.description}</p>

        <PresetSelector value={detectPreset(options.phashThreshold, options.ssimThreshold) ?? 'balanced'} onChange={onPresetChange} />
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
      </div>
    )
  }

  // Generic plugin: show name + description + default thresholds
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Puzzle className="w-4 h-4 text-primary" />
        <p className="text-sm font-semibold text-foreground-primary">{plugin.name}</p>
        <span className="text-[10px] font-mono text-foreground-muted bg-surface-secondary px-1.5 py-0.5 rounded">v{plugin.version}</span>
      </div>
      <p className="text-xs text-foreground-muted">{plugin.description}</p>
      <div className="flex gap-4 text-xs text-foreground-muted">
        <span>Hash threshold: <strong className="text-foreground-primary">{plugin.defaultHashThreshold}</strong></span>
        {plugin.defaultVerifyThreshold != null && (
          <span>Verify threshold: <strong className="text-foreground-primary">{plugin.defaultVerifyThreshold}</strong></span>
        )}
      </div>
    </div>
  )
}

export function AdvancedSettings({ open, options, plugins, onToggle, onOptionChange, onPresetChange }: AdvancedSettingsProps) {
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
          {plugins.map((plugin, idx) => (
            <div key={plugin.id}>
              {idx > 0 && <div className="border-t border-border my-6" />}
              <PluginSection
                plugin={plugin}
                options={options}
                onOptionChange={onOptionChange}
                onPresetChange={onPresetChange}
                t={t}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
