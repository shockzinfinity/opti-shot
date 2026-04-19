import { X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export function PageCloseButton() {
  const navigate = useNavigate()

  return (
    <button
      onClick={() => navigate('/')}
      className="p-2 rounded-xl hover:bg-surface-secondary transition-colors"
      aria-label="Close and return to dashboard"
      title="Close"
    >
      <X className="w-5 h-5 text-foreground-muted" />
    </button>
  )
}
