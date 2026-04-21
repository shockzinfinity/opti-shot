import { ScanLine, FolderSync, Trash2, Info, CheckCheck, X } from 'lucide-react'
import { useNotificationStore } from '../stores/notification'
import type { NotificationItem } from '../stores/notification'
import { useTranslation } from '@renderer/hooks/useTranslation'

const CATEGORY_ICONS = {
  scan: ScanLine,
  organize: FolderSync,
  trash: Trash2,
  system: Info,
} as const

const LEVEL_COLORS = {
  info: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-error',
} as const

function formatRelativeTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function NotificationRow({ item }: { item: NotificationItem }) {
  const Icon = CATEGORY_ICONS[item.category]
  const levelColor = LEVEL_COLORS[item.level]

  return (
    <div className={`flex items-start gap-3 px-5 py-3.5 transition-colors ${
      item.isRead ? 'bg-surface-primary' : 'bg-primary/[0.03]'
    }`}>
      <div className="mt-1.5 shrink-0 w-2">
        {!item.isRead && (
          <div className="w-2 h-2 rounded-full bg-primary" />
        )}
      </div>

      <div className={`mt-0.5 shrink-0 ${item.isRead ? 'text-foreground-muted' : levelColor}`}>
        <Icon className="w-4 h-4" />
      </div>

      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug ${
          item.isRead ? 'text-foreground-secondary' : 'text-foreground-primary font-medium'
        }`}>
          {item.message}
        </p>
        <p className="text-xs text-foreground-muted mt-1">
          {formatRelativeTime(item.timestamp)}
        </p>
      </div>
    </div>
  )
}

export function NotificationPanel() {
  const { notifications, unreadCount, markAllRead, clearAll } =
    useNotificationStore()
  const { t } = useTranslation()

  return (
    <div className="absolute right-0 top-full mt-2 w-[420px] bg-surface-primary border border-border rounded-xl shadow-xl z-50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-foreground-primary">
            {t('notification.title')}
          </p>
          {unreadCount > 0 && (
            <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="text-xs text-foreground-muted hover:text-primary transition-colors px-2 py-1 rounded-lg hover:bg-surface-secondary flex items-center gap-1"
            >
              <CheckCheck className="w-3 h-3" />
              {t('notification.markAllRead')}
            </button>
          )}
          {notifications.length > 0 && (
            <button
              onClick={clearAll}
              className="text-xs text-foreground-muted hover:text-error transition-colors px-2 py-1 rounded-lg hover:bg-surface-secondary flex items-center gap-1"
              title={t('notification.clearAll')}
            >
              <X className="w-3 h-3" />
              {t('notification.clearAll')}
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="max-h-[480px] overflow-y-auto divide-y divide-border/50">
        {notifications.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-foreground-muted">
            {t('notification.empty')}
          </div>
        ) : (
          notifications.map((item) => (
            <NotificationRow key={item.id} item={item} />
          ))
        )}
      </div>
    </div>
  )
}
