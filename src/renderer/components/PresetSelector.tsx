import { Wand2 } from 'lucide-react'
import { useTranslation } from '@renderer/hooks/useTranslation'
import type { TranslationKey } from '@renderer/i18n'

type Preset = 'balanced' | 'conservative' | 'sensitive'

interface PresetInfo {
  id: Preset
  labelKey: TranslationKey
  descKey: TranslationKey
  details: string
}

const PRESETS: PresetInfo[] = [
  {
    id: 'balanced',
    labelKey: 'preset.balanced',
    descKey: 'preset.balancedDesc',
    details: 'pHash 8 · SSIM 0.85 · 8 threads',
  },
  {
    id: 'conservative',
    labelKey: 'preset.conservative',
    descKey: 'preset.conservativeDesc',
    details: 'pHash 6 · SSIM 0.90 · 4 threads',
  },
  {
    id: 'sensitive',
    labelKey: 'preset.sensitive',
    descKey: 'preset.sensitiveDesc',
    details: 'pHash 10 · SSIM 0.80 · 16 threads',
  },
]

interface PresetSelectorProps {
  value: Preset
  onChange: (preset: Preset) => void
}

export function PresetSelector({ value, onChange }: PresetSelectorProps) {
  const { t } = useTranslation()

  return (
    <div className="grid grid-cols-3 gap-4">
      {PRESETS.map((preset) => {
        const isActive = value === preset.id
        return (
          <button
            key={preset.id}
            onClick={() => onChange(preset.id)}
            className={`p-4 rounded-xl text-left transition-all ${
              isActive
                ? 'border-2 border-primary bg-primary/5'
                : 'border-2 border-transparent bg-surface-secondary hover:border-border'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <Wand2 className={`w-4 h-4 ${isActive ? 'text-primary' : 'text-foreground-muted'}`} />
              <span className={`text-sm font-semibold ${isActive ? 'text-primary' : 'text-foreground-primary'}`}>
                {t(preset.labelKey)}
              </span>
            </div>
            <p className="text-xs text-foreground-secondary mb-1">{t(preset.descKey)}</p>
            <p className="text-xs font-mono text-foreground-muted">{preset.details}</p>
          </button>
        )
      })}
    </div>
  )
}
