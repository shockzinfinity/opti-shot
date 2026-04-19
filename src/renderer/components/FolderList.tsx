import { FolderOpen, X, Plus } from 'lucide-react'
import type { FolderEntry } from '../stores/folder'
import { useTranslation } from '@renderer/hooks/useTranslation'

interface FolderListProps {
  folders: FolderEntry[]
  onAdd: () => void
  onRemove: (id: string) => void
}

export function FolderList({ folders, onAdd, onRemove }: FolderListProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-2">
      {folders.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 text-foreground-muted space-y-2">
          <FolderOpen className="w-10 h-10 opacity-40" />
          <p className="text-sm">{t('folders.noFolders')}. {t('folders.noFoldersDesc')}</p>
        </div>
      )}

      {folders.map((folder) => (
        <div
          key={folder.id}
          className="flex items-center justify-between p-4 rounded-xl bg-surface-secondary/50 hover:bg-surface-secondary group transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <FolderOpen className="w-5 h-5 text-primary shrink-0" />
            <span className="font-mono text-sm text-foreground-primary truncate">{folder.path}</span>
            {folder.includeSubfolders && (
              <span className="text-[10px] font-bold uppercase tracking-wider bg-warning/10 text-warning px-2 py-0.5 rounded-full shrink-0">
                {t('folders.includesSubfolders')}
              </span>
            )}
            {!folder.isAccessible && (
              <span className="text-[10px] font-bold uppercase tracking-wider bg-error/10 text-error px-2 py-0.5 rounded-full shrink-0">
                {t('folders.inaccessible')}
              </span>
            )}
          </div>
          <button
            onClick={() => onRemove(folder.id)}
            className="ml-3 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-error/10 hover:text-error text-foreground-muted transition-all shrink-0"
            aria-label="Remove folder"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}

      <button
        onClick={onAdd}
        className="flex items-center gap-2 w-full px-4 py-3 rounded-xl border border-dashed border-border text-foreground-secondary hover:border-primary hover:text-primary hover:bg-primary/5 transition-all text-sm font-semibold"
      >
        <Plus className="w-4 h-4" />
        {t('folders.addFolder')}
      </button>
    </div>
  )
}
