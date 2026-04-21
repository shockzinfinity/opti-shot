import { Wand2 } from 'lucide-react'
import { useTranslation } from '@renderer/hooks/useTranslation'
import type { TranslationKey } from '@renderer/i18n'
import type { ScanPreset } from '@shared/types'
import { SCAN_PRESETS } from '@shared/constants'

interface PresetInfo {
  id: ScanPreset
  labelKey: TranslationKey
  descKey: TranslationKey
}

const PRESETS: PresetInfo[] = [
  { id: 'balanced', labelKey: 'preset.balanced', descKey: 'preset.balancedDesc' },
  { id: 'fast', labelKey: 'preset.fast', descKey: 'preset.fastDesc' },
  { id: 'conservative', labelKey: 'preset.conservative', descKey: 'preset.conservativeDesc' },
  { id: 'precise', labelKey: 'preset.precise', descKey: 'preset.preciseDesc' },
]

interface PresetSelectorProps {
  value: ScanPreset
  onChange: (preset: ScanPreset) => void
}

export function PresetSelector({ value, onChange }: PresetSelectorProps) {
  const { t } = useTranslation()

  // Filter out 'custom' from selectable presets; show it as active label only
  const selectablePresets = PRESETS.filter((p) => p.id !== 'custom')

  return (
    <div className="grid grid-cols-4 gap-4">
      {selectablePresets.map((preset) => {
        const isActive = value === preset.id
        const config = SCAN_PRESETS[preset.id as Exclude<ScanPreset, 'custom'>]
        const hashSummary = config.hashAlgorithms.join('+')
        const verifySummary = config.verifyAlgorithms.length > 0 ? config.verifyAlgorithms.join('+') : 'none'
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
            <p className="text-xs font-mono text-foreground-muted">
              {hashSummary} · {verifySummary} · {config.parallelThreads}T
            </p>
          </button>
        )
      })}
    </div>
  )
}
