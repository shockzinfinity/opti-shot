import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface SidePanelProps {
  title: ReactNode
  icon: ReactNode
  onClose: () => void
  children: ReactNode
}

export function SidePanel({ title, icon, onClose, children }: SidePanelProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-40 transition-opacity"
        onClick={onClose}
      />
      <div className="fixed top-0 right-0 h-full w-[400px] bg-surface-primary shadow-2xl z-50 flex flex-col animate-slide-in-right">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-primary shrink-0">{icon}</span>
            <div className="min-w-0">{title}</div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-foreground-muted hover:bg-surface-secondary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </>
  )
}

export function PanelSection({ icon, title, children }: { icon?: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="px-5 py-3">
      <div className="flex items-center gap-1.5 mb-2">
        {icon && <span className="text-primary">{icon}</span>}
        <h3 className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">{title}</h3>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

export function PanelEmpty({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-32">
      <span className="text-sm text-foreground-muted">{message}</span>
    </div>
  )
}

export function PanelRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between gap-3 text-[11px]">
      <span className="text-foreground-muted shrink-0">{label}</span>
      <span
        className={`font-mono text-right truncate ${highlight ? 'font-semibold text-primary' : 'text-foreground-primary'}`}
        title={value}
      >
        {value}
      </span>
    </div>
  )
}
