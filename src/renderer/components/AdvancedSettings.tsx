import { Settings2, ChevronDown, ChevronUp, Hash, Eye, Clock, Cpu, RefreshCcw, Filter, Zap, Camera, Ruler, MapPin, Calendar } from 'lucide-react'
import type { ScanOptions, ScanPresetId, ExifGpsFilter } from '../stores/folder'
import type { TranslationKey } from '@renderer/i18n'
import { detectPreset } from '@shared/constants'
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

          {/* EXIF Filtering */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-primary" />
                <p className="text-sm font-semibold text-foreground-primary">{t('advanced.exifFiltering')}</p>
              </div>
              <button
                onClick={() => onOptionChange('enableExifFilter', !options.enableExifFilter)}
                className={`w-10 h-5 rounded-full relative flex items-center px-0.5 transition-colors ${options.enableExifFilter ? 'bg-primary' : 'bg-border'}`}
                role="switch"
                aria-checked={options.enableExifFilter}
              >
                <div className={`w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${options.enableExifFilter ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
            <p className="text-xs text-foreground-muted">{t('advanced.exifFilteringDesc')}</p>

            {options.enableExifFilter && (
              <div className="space-y-3 pl-1 border-l-2 border-primary/20 ml-2">
                {/* Date range */}
                <div className="pl-3 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground-secondary">
                    <Calendar className="w-3 h-3" />
                    {t('advanced.exifDateRange')}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={options.exifDateStart ?? ''}
                      onChange={(e) => onOptionChange('exifDateStart', e.target.value || null)}
                      className="flex-1 px-2 py-1.5 rounded-lg border border-border bg-surface-primary text-foreground-primary text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary/40"
                    />
                    <span className="text-xs text-foreground-muted">~</span>
                    <input
                      type="date"
                      value={options.exifDateEnd ?? ''}
                      onChange={(e) => onOptionChange('exifDateEnd', e.target.value || null)}
                      className="flex-1 px-2 py-1.5 rounded-lg border border-border bg-surface-primary text-foreground-primary text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary/40"
                    />
                  </div>
                </div>

                {/* Camera model */}
                <div className="pl-3 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground-secondary">
                    <Camera className="w-3 h-3" />
                    {t('advanced.exifCameraModel')}
                  </div>
                  <input
                    type="text"
                    value={options.exifCameraFilter}
                    onChange={(e) => onOptionChange('exifCameraFilter', e.target.value)}
                    placeholder={t('advanced.exifCameraPlaceholder')}
                    className="w-full px-2 py-1.5 rounded-lg border border-border bg-surface-primary text-foreground-primary text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-foreground-muted/50"
                  />
                </div>

                {/* Min resolution */}
                <div className="pl-3 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground-secondary">
                    <Ruler className="w-3 h-3" />
                    {t('advanced.exifMinResolution')}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      value={options.exifMinWidth || ''}
                      onChange={(e) => onOptionChange('exifMinWidth', Number(e.target.value) || 0)}
                      placeholder="W"
                      className="w-20 px-2 py-1.5 rounded-lg border border-border bg-surface-primary text-foreground-primary text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-foreground-muted/50"
                    />
                    <span className="text-xs text-foreground-muted">×</span>
                    <input
                      type="number"
                      min={0}
                      value={options.exifMinHeight || ''}
                      onChange={(e) => onOptionChange('exifMinHeight', Number(e.target.value) || 0)}
                      placeholder="H"
                      className="w-20 px-2 py-1.5 rounded-lg border border-border bg-surface-primary text-foreground-primary text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-foreground-muted/50"
                    />
                    <span className="text-xs text-foreground-muted">px</span>
                  </div>
                </div>

                {/* GPS filter */}
                <div className="pl-3 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground-secondary">
                    <MapPin className="w-3 h-3" />
                    {t('advanced.exifGps')}
                  </div>
                  <div className="flex gap-2">
                    {(['all', 'with_gps', 'without_gps'] as ExifGpsFilter[]).map((val) => (
                      <button
                        key={val}
                        onClick={() => onOptionChange('exifGpsFilter', val)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border ${
                          options.exifGpsFilter === val
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-surface-secondary text-foreground-muted hover:border-foreground-muted'
                        }`}
                      >
                        {t(`advanced.exifGps.${val}` as TranslationKey)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Upcoming features — disabled with "준비 중" */}
          <div className="space-y-2 pt-2">
            <p className="text-xs font-semibold text-foreground-muted uppercase tracking-wider">{t('advanced.upcoming')}</p>
            {[
              { icon: <RefreshCcw className="w-3.5 h-3.5" />, label: t('advanced.correctionDetection'), desc: t('advanced.correctionDetectionDesc') },
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
