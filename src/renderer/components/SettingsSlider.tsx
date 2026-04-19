interface SettingsSliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  format?: (v: number) => string
  onChange: (v: number) => void
}

export function SettingsSlider({ label, value, min, max, step, format, onChange }: SettingsSliderProps) {
  const display = format ? format(value) : String(value)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-body text-foreground-primary">{label}</span>
        <span className="text-sm font-mono font-semibold text-primary min-w-[3rem] text-right">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-border rounded-full appearance-none cursor-pointer accent-primary"
      />
      <div className="flex justify-between text-xs text-foreground-muted font-mono">
        <span>{format ? format(min) : min}</span>
        <span>{format ? format(max) : max}</span>
      </div>
    </div>
  )
}
