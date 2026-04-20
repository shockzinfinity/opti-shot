import { Filter, Calendar, Camera, Ruler, MapPin } from 'lucide-react'
import type { ScanOptions, ExifGpsFilter } from '../stores/folder'
import type { TranslationKey } from '@renderer/i18n'
import { useTranslation } from '@renderer/hooks/useTranslation'

interface ExifFilterSectionProps {
  options: ScanOptions
  onOptionChange: <K extends keyof ScanOptions>(key: K, value: ScanOptions[K]) => void
}

export function ExifFilterSection({ options, onOptionChange }: ExifFilterSectionProps) {
  const { t } = useTranslation()

  if (!options.enableExifFilter) return null

  return (
    <div className="bg-surface-primary border border-border rounded-xl p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
          <Filter className="w-5 h-5" />
        </div>
        <div>
          <p className="font-semibold text-foreground-primary">{t('advanced.exifFiltering')}</p>
          <p className="text-xs text-foreground-muted mt-0.5">{t('advanced.exifFilteringDesc')}</p>
        </div>
      </div>

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
            <span className="text-xs text-foreground-muted">x</span>
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
    </div>
  )
}
