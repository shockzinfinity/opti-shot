import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderSync, ArrowRight, Undo2, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { useOrganizeStore } from '@renderer/stores/organize'
import { useTranslation } from '@renderer/hooks/useTranslation'
import type { TranslationKey } from '@renderer/i18n'
import type { OrganizePreviewItem } from '@shared/types'
import { formatDateTime } from '@shared/utils'
import { SingleFolderPicker } from '@renderer/components/FolderPicker'
import { PageCloseButton } from '@renderer/components/PageCloseButton'
import { ActionBar } from '@renderer/components/ActionBar'

/** Extract filename from full path (renderer-safe, no node:path) */
function getBasename(filePath: string): string {
  const sep = filePath.includes('\\') ? '\\' : '/'
  return filePath.split(sep).pop() ?? filePath
}

/** Shared rename table used in preview and done phases */
function RenameTable({ items, t }: { items: OrganizePreviewItem[]; t: (key: TranslationKey) => string }) {
  return (
    <div className="max-h-96 overflow-auto border border-border rounded-lg">
      <table className="w-full text-sm">
        <thead className="bg-surface-secondary sticky top-0">
          <tr className="border-b border-border">
            <th className="text-left px-3 py-2 font-medium text-foreground-secondary">{t('organize.originalName')}</th>
            <th className="text-center px-2 py-2 w-8"></th>
            <th className="text-left px-3 py-2 font-medium text-foreground-secondary">{t('organize.newName')}</th>
            <th className="text-left px-3 py-2 font-medium text-foreground-secondary w-16">{t('organize.source')}</th>
          </tr>
        </thead>
        <tbody>
          {items.slice(0, 200).map((item, i) => (
            <tr key={i} className="border-b border-border last:border-0">
              <td className="px-3 py-1.5 font-mono text-xs truncate max-w-[240px]">
                {getBasename(item.originalPath)}
              </td>
              <td className="text-center text-foreground-muted">→</td>
              <td className="px-3 py-1.5 font-mono text-xs text-primary truncate max-w-[240px]">
                {getBasename(item.renamedPath)}
              </td>
              <td className="px-3 py-1.5">
                <span className={`text-xs px-1.5 py-0.5 rounded ${item.dateSource === 'exif' ? 'bg-primary-light text-primary' : 'bg-warning-light text-warning'}`}>
                  {item.dateSource === 'exif' ? 'EXIF' : t('organize.fileDate')}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length > 200 && (
        <p className="text-xs text-foreground-muted text-center py-2">
          {t('organize.andMore').replace('{count}', String(items.length - 200))}
        </p>
      )}
    </div>
  )
}

export function Organize() {
  const {
    phase, folder, includeSubfolders, previewItems,
    totalFiles, renamedCount, skippedCount,
    progress, lastJob, error,
    setFolder, setIncludeSubfolders,
    loadLastJob, runPreview, runExecute, runUndo, reset,
    startListening,
  } = useOrganizeStore()
  const navigate = useNavigate()
  const { t } = useTranslation()

  useEffect(() => { loadLastJob() }, [loadLastJob])
  useEffect(() => { const unsub = startListening(); return unsub }, [startListening])

  const handleSelectFolder = async () => {
    const res = await window.electron.command('dialog.openDirectory') as { success: boolean; data?: string | null }
    if (res.success && res.data) setFolder(res.data)
  }

  const handleCancel = () => {
    reset()
    navigate('/')
  }

  return (
    <div className="max-w-[900px] mx-auto p-8 space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[28px] font-heading font-bold">{t('organize.title')}</h1>
          <p className="text-foreground-secondary mt-1">{t('organize.subtitle')}</p>
        </div>
        <PageCloseButton />
      </div>

      {/* Section 1: Folder Selection */}
      {(phase === 'select' || phase === 'previewing') && (
        <>
          <div className="bg-surface-primary border border-border rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold text-foreground-primary">{t('organize.targetFolder')}</h2>
            </div>
            <SingleFolderPicker
              folder={folder}
              includeSubfolders={includeSubfolders}
              onSelect={handleSelectFolder}
              onClear={() => setFolder(null)}
              onToggleSubfolders={setIncludeSubfolders}
            />
          </div>

          {/* Section 2: Pattern info */}
          <div className="bg-surface-primary border border-border rounded-xl p-6">
            <p className="text-sm font-semibold text-foreground-primary">{t('organize.patternLabel')}</p>
            <p className="font-mono text-sm mt-2 text-primary">
              {'YYYY-MM-DD_HHmmss.ext'}
            </p>
            <p className="text-xs text-foreground-muted mt-1">{t('organize.patternDesc')}</p>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-error text-sm px-1">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          {/* Action Bar */}
          <ActionBar
            onCancel={handleCancel}
            onSubmit={runPreview}
            submitLabel={phase === 'previewing'
              ? (progress ? `${progress.processedFiles}/${progress.totalFiles}` : t('organize.analyzing'))
              : t('organize.preview')
            }
            submitIcon={phase === 'previewing'
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <ArrowRight className="w-4 h-4" />
            }
            submitDisabled={!folder || phase === 'previewing'}
          />
        </>
      )}

      {/* Preview */}
      {phase === 'preview' && (
        <>
          <div className="bg-surface-primary border border-border rounded-xl p-6 space-y-4">
            <h2 className="text-base font-semibold">{t('organize.previewTitle')}</h2>

            <div className="flex gap-6 text-sm">
              <span className="text-foreground-secondary">
                {t('organize.totalFiles')}: <strong className="text-foreground-primary">{totalFiles}</strong>
              </span>
              <span className="text-success">
                {t('organize.toRename')}: <strong>{renamedCount}</strong>
              </span>
              <span className="text-foreground-muted">
                {t('organize.toSkip')}: <strong>{skippedCount}</strong>
              </span>
            </div>

            <RenameTable items={previewItems} t={t} />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-error text-sm px-1">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          <ActionBar
            onCancel={reset}
            onSubmit={runExecute}
            submitLabel={`${t('organize.execute')} (${renamedCount})`}
            submitIcon={<FolderSync className="w-4 h-4" />}
            submitDisabled={renamedCount === 0}
          />
        </>
      )}

      {/* Executing */}
      {phase === 'executing' && (
        <div className="bg-surface-primary border border-border rounded-xl p-8 flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-foreground-secondary">{t('organize.executing')}</p>
          {progress && (
            <p className="font-mono text-sm">{progress.processedFiles}/{progress.totalFiles}</p>
          )}
        </div>
      )}

      {/* Done */}
      {phase === 'done' && (
        <div className="bg-surface-primary border border-border rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-6 h-6 text-success" />
            <h2 className="font-heading font-semibold text-lg">{t('organize.completed')}</h2>
          </div>
          <div className="flex gap-6 text-sm">
            <span>{t('organize.totalFiles')}: <strong>{totalFiles}</strong></span>
            <span className="text-success">{t('organize.renamed')}: <strong>{renamedCount}</strong></span>
            <span className="text-foreground-muted">{t('organize.skipped')}: <strong>{skippedCount}</strong></span>
          </div>

          {previewItems.length > 0 && <RenameTable items={previewItems} t={t} />}

          <div className="flex gap-3 pt-2">
            <button
              onClick={runUndo}
              disabled={lastJob?.status === 'undone'}
              className="flex items-center gap-2 px-5 py-2.5 border border-border rounded-lg hover:bg-surface-secondary disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              <Undo2 className="w-4 h-4" />
              {lastJob?.status === 'undone' ? t('organize.undone') : t('organize.undo')}
            </button>
            <button
              onClick={reset}
              className="px-5 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-hover cursor-pointer transition-colors"
            >
              {t('organize.newOrganize')}
            </button>
          </div>
        </div>
      )}

      {/* Last Job (select phase only) */}
      {phase === 'select' && lastJob && (
        <div className="bg-surface-primary border border-border rounded-xl p-5 space-y-3">
          <h3 className="font-heading font-semibold text-sm text-foreground-secondary">{t('organize.lastOrganize')}</h3>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-mono">{lastJob.folder}</p>
              <p className="text-xs text-foreground-muted">
                {formatDateTime(lastJob.startedAt)} · {lastJob.renamedFiles}{t('organize.filesRenamed')}
              </p>
            </div>
            {lastJob.status === 'completed' && (
              <button
                onClick={runUndo}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-surface-secondary cursor-pointer transition-colors"
              >
                <Undo2 className="w-3.5 h-3.5" />
                {t('organize.undo')}
              </button>
            )}
            {lastJob.status === 'undone' && (
              <span className="text-xs text-foreground-muted px-2 py-1 bg-surface-secondary rounded">{t('organize.undone')}</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
