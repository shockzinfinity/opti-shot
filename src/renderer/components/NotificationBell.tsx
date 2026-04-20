import { useEffect, useRef, useCallback } from 'react'
import { Bell } from 'lucide-react'
import { useNotificationStore } from '../stores/notification'
import { NotificationPanel } from './NotificationPanel'

export function NotificationBell() {
  const { unreadCount, isOpen, loadInitial, startListening, markAllRead, toggle, close } =
    useNotificationStore()
  const containerRef = useRef<HTMLDivElement>(null)
  const wasOpen = useRef(false)

  useEffect(() => {
    loadInitial()
    const unsubscribe = startListening()
    return unsubscribe
  }, [loadInitial, startListening])

  // Mark all read when panel closes (was open → now closed)
  useEffect(() => {
    if (wasOpen.current && !isOpen) {
      markAllRead()
    }
    wasOpen.current = isOpen
  }, [isOpen, markAllRead])

  // Close on outside click
  const handleOutsideClick = useCallback((e: MouseEvent) => {
    if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
      close()
    }
  }, [close])

  useEffect(() => {
    if (!isOpen) return
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [isOpen, handleOutsideClick])

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={toggle}
        className="p-2 rounded-xl hover:bg-surface-secondary hover:text-primary cursor-pointer transition-colors relative"
        title="Notifications"
        aria-label="Notifications"
      >
        <Bell className="w-4.5 h-4.5 text-foreground-muted" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-error text-white text-[10px] font-bold px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && <NotificationPanel />}
    </div>
  )
}
