import { useTranslation } from '@renderer/hooks/useTranslation'

interface ActionBarProps {
  onCancel: () => void
  onSubmit: () => void
  submitLabel: string
  submitIcon?: React.ReactNode
  submitDisabled?: boolean
  extra?: React.ReactNode
}

export function ActionBar({ onCancel, onSubmit, submitLabel, submitIcon, submitDisabled, extra }: ActionBarProps) {
  const { t } = useTranslation()

  return (
    <div className="flex items-center justify-between pt-2">
      <div className="flex items-center gap-3">
        <button
          onClick={onCancel}
          className="px-6 py-2.5 rounded-xl border border-border text-foreground-secondary font-semibold hover:bg-surface-secondary transition-all"
        >
          {t('common.cancel')}
        </button>
        {extra}
      </div>

      <button
        onClick={onSubmit}
        disabled={submitDisabled}
        className="flex items-center gap-2.5 bg-primary text-white px-8 py-3 rounded-xl font-bold hover:bg-primary-hover transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-primary"
      >
        {submitIcon}
        {submitLabel}
      </button>
    </div>
  )
}
