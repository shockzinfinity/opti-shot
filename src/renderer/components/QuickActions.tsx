import { useNavigate } from 'react-router-dom'
import { Scan, Trash2, Settings } from 'lucide-react'
import { useTranslation } from '@renderer/hooks/useTranslation'

interface ActionButtonProps {
  icon: React.ReactNode
  label: string
  desc: string
  primary?: boolean
  onClick: () => void
}

function ActionButton({ icon, label, desc, primary, onClick }: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-4 p-4 rounded-xl text-left transition-all w-full ${
        primary
          ? 'bg-primary text-white hover:bg-primary/90'
          : 'bg-surface-primary border border-border hover:bg-surface-secondary'
      }`}
    >
      <div
        className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
          primary ? 'bg-white/20' : 'bg-surface-secondary'
        }`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <span className="block font-semibold text-sm">{label}</span>
        <span className={`text-xs ${primary ? 'text-white/80' : 'text-foreground-muted'}`}>{desc}</span>
      </div>
    </button>
  )
}

export function QuickActions() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  return (
    <div className="bg-surface-secondary rounded-xl p-6 space-y-4">
      <h2 className="font-heading font-semibold text-base text-foreground-primary">{t('common.quickActions')}</h2>
      <div className="space-y-2">
        <ActionButton
          icon={<Scan className="w-5 h-5" />}
          label={t('actions.startScan')}
          desc={t('actions.processLibrary')}
          primary
          onClick={() => navigate('/folders')}
        />
        <ActionButton
          icon={<Trash2 className="w-5 h-5" />}
          label={t('actions.trash')}
          desc={t('actions.manageDeleted')}
          onClick={() => navigate('/trash')}
        />
        <ActionButton
          icon={<Settings className="w-5 h-5" />}
          label={t('actions.settings')}
          desc={t('actions.preferences')}
          onClick={() => navigate('/settings')}
        />
      </div>
    </div>
  )
}
