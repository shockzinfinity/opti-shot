import { useEffect, useCallback } from 'react'
import { RotateCcw, Trash2, AlertTriangle } from 'lucide-react'
import { useTrashStore } from '@renderer/stores/trash'
import { PageCloseButton } from '@renderer/components/PageCloseButton'
import { TrashSummary } from '@renderer/components/TrashSummary'
import { TrashList } from '@renderer/components/TrashList'
import { useTranslation } from '@renderer/hooks/useTranslation'

export function Trash() {
  const {
    items,
    total,
    summary,
    selectedIds,
    loading,
    loadItems,
    loadSummary,
    toggleSelect,
    selectAll,
    deselectAll,
    restoreSelected,
    deleteSelected,
    emptyTrash,
  } = useTrashStore()
  const { t } = useTranslation()

  useEffect(() => {
    loadItems()
    loadSummary()
  }, [loadItems, loadSummary])

  const allSelected = items.length > 0 && selectedIds.size === items.length
  const someSelected = selectedIds.size > 0

  const handleSelectAll = useCallback(() => {
    if (allSelected) {
      deselectAll()
    } else {
      selectAll()
    }
  }, [allSelected, selectAll, deselectAll])

  const handleRestoreOne = useCallback(
    async (id: string) => {
      // Temporarily select just this one, restore, then restore previous selection
      const prev = new Set(selectedIds)
      useTrashStore.setState({ selectedIds: new Set([id]) })
      await restoreSelected()
      // Restore prior selection minus the restored item
      prev.delete(id)
      useTrashStore.setState({ selectedIds: prev })
    },
    [selectedIds, restoreSelected]
  )

  const handleEmptyTrash = useCallback(async () => {
    const confirmed = window.confirm(t('trash.confirmEmpty'))
    if (confirmed) {
      await emptyTrash()
    }
  }, [emptyTrash, t])

  const handleDeleteSelected = useCallback(async () => {
    const confirmed = window.confirm(
      t('trash.confirmDelete').replace('{count}', String(selectedIds.size))
    )
    if (confirmed) {
      await deleteSelected()
    }
  }, [selectedIds.size, deleteSelected, t])

  return (
    <div className="max-w-[900px] mx-auto p-8 pb-32 space-y-6">
      <div className="flex justify-end">
        <PageCloseButton />
      </div>

      {/* Trash Summary card */}
      <TrashSummary summary={summary} />

      {/* File list section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-sm font-semibold text-foreground-secondary uppercase tracking-wider font-mono">
            {loading ? t('common.loading') : `${total.toLocaleString()} ${total !== 1 ? t('trash.items') : t('trash.item')}`}
          </h3>
        </div>

        <TrashList
          items={items}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onRestore={handleRestoreOne}
        />
      </div>

      {/* Bottom Action Bar */}
      {items.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-[860px] px-4">
          <div className="bg-surface-primary/90 backdrop-blur-md border border-border rounded-xl shadow-lg p-4 flex items-center justify-between gap-4">
            {/* Left: Select all + count */}
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={handleSelectAll}
                  className="w-4 h-4 rounded border-border accent-primary cursor-pointer"
                  aria-label="Select all"
                />
                <span className="text-sm font-semibold text-foreground-secondary">{t('trash.selectAll')}</span>
              </label>
              {someSelected && (
                <span className="text-sm font-mono text-foreground-muted">
                  {selectedIds.size} {t('trash.selected')}
                </span>
              )}
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2">
              {someSelected && (
                <>
                  <button
                    onClick={restoreSelected}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-primary font-bold border-2 border-primary/20 hover:border-primary hover:bg-primary/5 transition-all text-sm"
                  >
                    <RotateCcw className="w-4 h-4" />
                    {t('trash.restore')}
                  </button>

                  <button
                    onClick={handleDeleteSelected}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-error font-bold border-2 border-error/20 hover:border-error hover:bg-error/5 transition-all text-sm"
                  >
                    <AlertTriangle className="w-4 h-4" />
                    {t('trash.deletePermanently')}
                  </button>
                </>
              )}

              <button
                onClick={handleEmptyTrash}
                disabled={items.length === 0}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-error text-white font-bold hover:bg-error/90 transition-all text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4" />
                {t('trash.emptyTrash')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
