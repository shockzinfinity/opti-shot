import { FixedSizeList } from 'react-window'
import { Image, RotateCcw } from 'lucide-react'
import type { TrashItem } from '@renderer/stores/trash'
import { formatBytes, formatDateLine } from '@shared/utils'
import { useTranslation } from '@renderer/hooks/useTranslation'

interface TrashListProps {
  items: TrashItem[]
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onRestore: (id: string) => void
}

function truncatePath(path: string, maxLen = 60): string {
  if (path.length <= maxLen) return path
  const half = Math.floor(maxLen / 2)
  return `${path.slice(0, half)}…${path.slice(-half)}`
}

interface TrashRowProps {
  item: TrashItem
  selected: boolean
  index: number
  onToggleSelect: (id: string) => void
  onRestore: (id: string) => void
}

function TrashRow({ item, selected, index, onToggleSelect, onRestore }: TrashRowProps) {
  const { t } = useTranslation()
  const isEven = index % 2 === 0
  const expiresDate = formatDateLine(item.expiresAt)
  const deletedDate = formatDateLine(item.deletedAt)

  return (
    <div
      className={[
        'group grid grid-cols-[auto_1fr_auto] gap-4 items-center p-4 rounded-xl hover:bg-surface-primary transition-colors',
        isEven ? 'bg-surface-secondary/50' : 'bg-transparent',
      ].join(' ')}
    >
      {/* Checkbox + icon */}
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(item.id)}
          className="w-4 h-4 rounded border-border accent-primary cursor-pointer"
          aria-label={`Select ${item.filename}`}
        />
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
          <Image className="w-4 h-4" />
        </div>
      </div>

      {/* File details */}
      <div className="min-w-0">
        <p className="font-semibold text-foreground-primary truncate">{item.filename}</p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-xs text-foreground-secondary">
          <span className="font-mono">{t('trash.deleted')}: {deletedDate}</span>
          <span className="text-foreground-muted">·</span>
          <span className="text-error font-medium font-mono">{t('trash.expires')}: {expiresDate}</span>
          <span className="text-foreground-muted">·</span>
          <span className="font-mono text-foreground-muted truncate max-w-xs" title={item.originalPath}>
            {truncatePath(item.originalPath)}
          </span>
          <span className="text-foreground-muted">·</span>
          <span className="font-mono">{formatBytes(item.fileSize)}</span>
        </div>
      </div>

      {/* Restore button */}
      <button
        onClick={() => onRestore(item.id)}
        title={t('trash.restore')}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-primary text-sm font-semibold border border-primary/20 hover:border-primary hover:bg-primary/5 transition-all opacity-0 group-hover:opacity-100"
      >
        <RotateCcw className="w-3.5 h-3.5" />
        {t('trash.restore')}
      </button>
    </div>
  )
}

export function TrashList({ items, selectedIds, onToggleSelect, onRestore }: TrashListProps) {
  const { t } = useTranslation()
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-foreground-muted gap-3">
        <div className="w-14 h-14 rounded-full bg-surface-secondary flex items-center justify-center">
          <Image className="w-6 h-6" />
        </div>
        <p className="text-sm font-body">{t('trash.noItems')}</p>
      </div>
    )
  }

  return (
    <FixedSizeList
      height={Math.min(items.length * 80, 500)}
      width="100%"
      itemCount={items.length}
      itemSize={80}
    >
      {({ index, style }) => {
        const item = items[index]
        return (
          <div style={style}>
            <TrashRow
              key={item.id}
              item={item}
              selected={selectedIds.has(item.id)}
              index={index}
              onToggleSelect={onToggleSelect}
              onRestore={onRestore}
            />
          </div>
        )
      }}
    </FixedSizeList>
  )
}
