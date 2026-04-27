import { Aperture, HelpCircle, Settings } from 'lucide-react'
import { NotificationBell } from './NotificationBell'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from '@renderer/hooks/useTranslation'
import type { TranslationKey } from '@renderer/i18n'

const routeNames: Record<string, TranslationKey> = {
  '/': 'nav.dashboard',
  '/folders': 'nav.folders',
  '/scan': 'nav.scan',
  '/review': 'nav.review',
  '/trash': 'nav.trash',
  '/organize': 'nav.organize',
  '/settings': 'nav.settings',
}

export function HeaderBar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const isHome = location.pathname === '/'
  const breadcrumb = t(routeNames[location.pathname] ?? 'nav.dashboard')

  return (
    <header className="flex items-center justify-between px-5 h-12 border-b border-border bg-surface-primary shrink-0">
      <div className="flex items-center gap-2.5">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 cursor-pointer hover:text-primary transition-colors"
          aria-label="Go to Dashboard"
          data-testid="header-dashboard-button"
        >
          <Aperture className="w-5 h-5 text-primary" />
          <span className="text-base font-heading font-bold hover:text-primary transition-colors">OptiShot</span>
        </button>
        {!isHome && (
          <>
            <span className="text-foreground-muted text-sm">/</span>
            <span className="text-sm text-foreground-muted">{breadcrumb}</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-1 app-no-drag">
        <NotificationBell />
        <button
          className="p-2 rounded-xl hover:bg-surface-secondary hover:text-primary cursor-pointer transition-colors"
          title="Info"
          aria-label="Info"
          onClick={() => navigate('/settings', { state: { tab: 'info' } })}
        >
          <HelpCircle className="w-4.5 h-4.5 text-foreground-muted" />
        </button>
        <button
          className="p-2 rounded-xl hover:bg-surface-secondary hover:text-primary cursor-pointer transition-colors"
          onClick={() => navigate('/settings', { state: { tab: 'scan' } })}
          title="Settings"
          aria-label="Settings"
        >
          <Settings className="w-4.5 h-4.5 text-foreground-muted" />
        </button>
      </div>
    </header>
  )
}
