import { useState, useEffect } from 'react'
import { Settings2, ChevronDown, ChevronUp, Clock, Cpu, Puzzle } from 'lucide-react'
import type { ScanOptions, ScanPresetId } from '../stores/folder'
import type { AlgorithmInfo } from '@shared/plugins'
import { PresetSelector } from './PresetSelector'
import { useTranslation } from '@renderer/hooks/useTranslation'

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

function Toggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      onClick={onToggle}
      className={`w-10 h-5 rounded-full relative flex items-center px-0.5 transition-colors ${on ? 'bg-primary' : 'bg-border'}`}
      role="switch"
      aria-checked={on}
      aria-label={label}
    >
      <div className={`w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${on ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  )
}

export function AdvancedSettings({ open, options, onToggle, onOptionChange, onPresetChange }: AdvancedSettingsProps) {
  const { t } = useTranslation()
  const [algorithms, setAlgorithms] = useState<AlgorithmInfo[]>([])

  useEffect(() => {
    window.electron.query('algorithm.list').then((res) => {
      if (res.success) setAlgorithms(res.data as unknown as AlgorithmInfo[])
    })
  }, [])

  const hashAlgos = algorithms.filter((a) => a.stage === 'hash')
  const verifyAlgos = algorithms.filter((a) => a.stage === 'verify')

  const isEnabled = (algo: AlgorithmInfo) =>
    algo.stage === 'hash'
      ? options.hashAlgorithms.includes(algo.id)
      : options.verifyAlgorithms.includes(algo.id)

  const handleToggle = (algo: AlgorithmInfo) => {
    if (algo.stage === 'hash') {
      const current = options.hashAlgorithms
      const updated = current.includes(algo.id)
        ? current.filter((id) => id !== algo.id)
        : [...current, algo.id]
      if (updated.length === 0) return
      onOptionChange('hashAlgorithms', updated)
    } else {
      const current = options.verifyAlgorithms
      const updated = current.includes(algo.id)
        ? current.filter((id) => id !== algo.id)
        : [...current, algo.id]
      onOptionChange('verifyAlgorithms', updated)
    }
    onPresetChange('custom' as ScanPresetId)
  }

  return (
    <div className="bg-surface-primary border border-border rounded-xl">
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
          {/* Preset Selector */}
          <PresetSelector value={options.preset ?? 'balanced'} onChange={onPresetChange} />

          {/* Stage 1: Hash Algorithms */}
          {hashAlgos.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-foreground-muted uppercase tracking-wider">
                Stage 1 — {t('settings.hashAlgorithms')}
              </p>
              {hashAlgos.map((algo) => {
                const enabled = isEnabled(algo)
                const threshold = options.hashThresholds[algo.id]
                return (
                  <div key={algo.id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Puzzle className="w-4 h-4 text-primary" />
                        <span className="text-sm font-semibold text-foreground-primary">{algo.name}</span>
                        <span className="text-[10px] text-foreground-muted">{algo.description}</span>
                      </div>
                      <Toggle on={enabled} onToggle={() => handleToggle(algo)} label={algo.name} />
                    </div>
                    {enabled && threshold != null && (
                      <div className="pl-6">
                        <SliderField
                          icon={<Puzzle className="w-3 h-3" />}
                          label={t('settings.threshold')}
                          value={threshold}
                          min={2}
                          max={20}
                          step={1}
                          format={(v) => `${v}`}
                          onChange={(v) => {
                            onOptionChange('hashThresholds', { ...options.hashThresholds, [algo.id]: v })
                            onPresetChange('custom' as ScanPresetId)
                          }}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Stage 2: Verify Algorithms */}
          {verifyAlgos.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-foreground-muted uppercase tracking-wider">
                Stage 2 — {t('settings.verifyAlgorithms')}
              </p>
              {verifyAlgos.map((algo) => {
                const enabled = isEnabled(algo)
                const threshold = options.verifyThresholds[algo.id]
                return (
                  <div key={algo.id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Puzzle className="w-4 h-4 text-primary" />
                        <span className="text-sm font-semibold text-foreground-primary">{algo.name}</span>
                        <span className="text-[10px] text-foreground-muted">{algo.description}</span>
                      </div>
                      <Toggle on={enabled} onToggle={() => handleToggle(algo)} label={algo.name} />
                    </div>
                    {enabled && threshold != null && (
                      <div className="pl-6">
                        <SliderField
                          icon={<Puzzle className="w-3 h-3" />}
                          label={t('settings.threshold')}
                          value={threshold}
                          min={0.01}
                          max={1}
                          step={0.01}
                          format={(v) => v.toFixed(2)}
                          onChange={(v) => {
                            onOptionChange('verifyThresholds', { ...options.verifyThresholds, [algo.id]: v })
                            onPresetChange('custom' as ScanPresetId)
                          }}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Performance */}
          <div className="space-y-3 border-t border-border pt-4">
            <div className="grid grid-cols-2 gap-6">
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
        </div>
      )}
    </div>
  )
}
