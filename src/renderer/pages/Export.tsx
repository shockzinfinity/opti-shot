import { useEffect } from 'react'
import { Download, Copy, MoveRight, FolderOpen, AlertTriangle, CheckCircle } from 'lucide-react'
import { useExportStore } from '@renderer/stores/export'
import { PageCloseButton } from '@renderer/components/PageCloseButton'
import { ExportSummary } from '@renderer/components/ExportSummary'
import { ProgressOverlay } from '@renderer/components/ProgressOverlay'
import { useFocusTrap } from '@renderer/hooks/useFocusTrap'
import { useTranslation } from '@renderer/hooks/useTranslation'

// ─── Completion Dialog ──────────────────────────────────────────────────────

function CompletionDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useFocusTrap<HTMLDivElement>()
  const { t } = useTranslation()

  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    const handler = () => onClose()
    el.addEventListener('dialog-close', handler)
    return () => el.removeEventListener('dialog-close', handler)
  }, [dialogRef, onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
    >
      <div
        ref={dialogRef}
        aria-label="Export complete"
        className="bg-surface-primary rounded-xl border border-border p-8 w-full max-w-sm mx-4 space-y-6 shadow-2xl text-center"
      >
        <div className="w-16 h-16 rounded-full bg-success-light flex items-center justify-center mx-auto">
          <CheckCircle className="w-8 h-8 text-success" />
        </div>
        <div>
          <h2 className="text-xl font-heading font-semibold text-foreground-primary">{t('export.complete')}</h2>
          <p className="mt-2 text-sm text-foreground-secondary">
            {t('export.completeDesc')}
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-full px-5 py-2.5 rounded-xl bg-primary text-white font-medium text-sm hover:bg-primary/90 transition-colors"
        >
          {t('export.done')}
        </button>
      </div>
    </div>
  )
}

// ─── Inline Radio Card (Export Action) ─────────────────────────────────────

interface ActionCardProps {
  selected: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  description: string
}

function ActionCard({ selected, onClick, icon, label, description }: ActionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        w-full text-left rounded-xl p-4 border-2 transition-all
        ${selected
          ? 'border-primary bg-primary/5'
          : 'border-transparent bg-surface-secondary hover:border-border'
        }
      `}
    >
      <div className="flex items-center gap-3 mb-1">
        <span className={`${selected ? 'text-primary' : 'text-foreground-secondary'}`}>
          {icon}
        </span>
        <span className={`font-medium text-sm ${selected ? 'text-primary' : 'text-foreground-primary'}`}>
          {label}
        </span>
      </div>
      <p className="text-xs text-foreground-muted ml-7">{description}</p>
    </button>
  )
}

// ─── Conflict Strategy Radio ────────────────────────────────────────────────

interface ConflictOptionProps {
  label: string
  description: string
  selected: boolean
  onClick: () => void
}

function ConflictOption({ label, description, selected, onClick }: ConflictOptionProps) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <div
        role="radio"
        aria-checked={selected}
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => e.key === 'Enter' || e.key === ' ' ? onClick() : undefined}
        className={`
          mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors
          ${selected ? 'border-primary bg-primary' : 'border-border bg-surface-secondary group-hover:border-primary/50'}
        `}
      >
        {selected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
      </div>
      <div className="min-w-0">
        <p className={`text-sm font-medium ${selected ? 'text-foreground-primary' : 'text-foreground-secondary'}`}>
          {label}
        </p>
        <p className="text-xs text-foreground-muted mt-0.5">{description}</p>
      </div>
    </label>
  )
}

// ─── Export Page ────────────────────────────────────────────────────────────

export function Export() {
  const {
    targetPath,
    action,
    conflictStrategy,
    autoCreateFolder,
    totalFiles,
    totalSize,
    isRunning,
    isComplete,
    progress,
    loadSummary,
    setTargetPath,
    browseFolder,
    setAction,
    setConflictStrategy,
    setAutoCreateFolder,
    startExport,
    cancelExport,
    reset,
    startListening,
  } = useExportStore()
  const { t } = useTranslation()

  useEffect(() => {
    void loadSummary()
    const unsubscribe = startListening()
    return unsubscribe
  }, [loadSummary, startListening])

  const canStart = targetPath.trim().length > 0 && totalFiles > 0

  return (
    <div className="max-w-[800px] mx-auto p-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[28px] font-heading font-bold">{t('export.title')}</h1>
          <p className="text-foreground-secondary mt-1">{t('export.subtitle')}</p>
        </div>
        <PageCloseButton />
      </div>

      {/* ── Section 1: Export Summary ── */}
      <ExportSummary totalFiles={totalFiles} totalSize={totalSize} />

      {/* ── Section 2: Destination Folder ── */}
      <div className="bg-surface-primary rounded-xl p-8 border border-border space-y-4">
        <h2 className="text-lg font-heading font-semibold text-foreground-primary">
          {t('export.destination')}
        </h2>

        <div className="flex gap-3">
          <input
            type="text"
            readOnly
            value={targetPath}
            placeholder={t('export.noFolder')}
            className="
              flex-1 px-4 py-2.5 rounded-xl border border-border
              bg-surface-secondary font-mono text-sm text-foreground-primary
              placeholder:text-foreground-muted focus:outline-none
            "
          />
          <button
            type="button"
            onClick={() => void browseFolder()}
            className="
              inline-flex items-center gap-2 px-4 py-2.5 rounded-xl
              border border-border text-foreground-primary text-sm font-medium
              hover:bg-surface-secondary transition-colors whitespace-nowrap
            "
          >
            <FolderOpen className="w-4 h-4" />
            {t('export.browse')}
          </button>
        </div>

        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={autoCreateFolder}
            onChange={(e) => setAutoCreateFolder(e.target.checked)}
            className="w-4 h-4 rounded border-border accent-primary cursor-pointer"
          />
          <span className="text-sm text-foreground-secondary">
            {t('export.createFolder')}
          </span>
        </label>
      </div>

      {/* ── Section 3: Export Action ── */}
      <div className="bg-surface-primary rounded-xl p-8 border border-border space-y-4">
        <h2 className="text-lg font-heading font-semibold text-foreground-primary">
          {t('export.action')}
        </h2>

        <div className="grid grid-cols-2 gap-3">
          <ActionCard
            selected={action === 'copy'}
            onClick={() => setAction('copy')}
            icon={<Copy className="w-5 h-5" />}
            label={t('export.copy')}
            description={t('export.copyDesc')}
          />
          <ActionCard
            selected={action === 'move'}
            onClick={() => setAction('move')}
            icon={<MoveRight className="w-5 h-5" />}
            label={t('export.move')}
            description={t('export.moveDesc')}
          />
        </div>

        {action === 'move' && (
          <div className="flex items-start gap-3 bg-error/5 text-error p-4 rounded-lg border border-error/20">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <p className="text-sm">
              {t('export.moveWarning')}
            </p>
          </div>
        )}
      </div>

      {/* ── Section 4: Conflict Strategy ── */}
      <div className="bg-surface-primary rounded-xl p-8 border border-border space-y-4">
        <h2 className="text-lg font-heading font-semibold text-foreground-primary">
          {t('export.conflictStrategy')}
        </h2>
        <p className="text-sm text-foreground-muted">
          {t('export.conflictDesc')}
        </p>

        <div className="space-y-4">
          <ConflictOption
            selected={conflictStrategy === 'skip'}
            onClick={() => setConflictStrategy('skip')}
            label={t('export.skip')}
            description={t('export.skipDesc')}
          />
          <ConflictOption
            selected={conflictStrategy === 'rename'}
            onClick={() => setConflictStrategy('rename')}
            label={t('export.rename')}
            description={t('export.renameDesc')}
          />
          <ConflictOption
            selected={conflictStrategy === 'overwrite'}
            onClick={() => setConflictStrategy('overwrite')}
            label={t('export.overwrite')}
            description={t('export.overwriteDesc')}
          />
        </div>
      </div>

      {/* ── Section 5: Action Buttons ── */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={() => {
            setTargetPath('')
            reset()
          }}
          className="
            px-5 py-2.5 rounded-xl border border-border
            text-foreground-primary text-sm font-medium
            hover:bg-surface-secondary transition-colors
          "
        >
          {t('common.cancel')}
        </button>

        <button
          type="button"
          onClick={() => void startExport()}
          disabled={!canStart}
          className="
            inline-flex items-center gap-2 px-6 py-2.5 rounded-xl
            bg-gradient-to-r from-primary to-primary/80 text-white
            text-sm font-medium shadow-sm
            hover:from-primary/90 hover:to-primary/70 transition-all
            disabled:opacity-40 disabled:cursor-not-allowed
          "
        >
          <Download className="w-4 h-4" />
          {t('export.startExport')}
        </button>
      </div>

      {/* ── Progress Overlay ── */}
      {isRunning && progress && (
        <ProgressOverlay progress={progress} onCancel={() => void cancelExport()} />
      )}

      {/* ── Completion Dialog ── */}
      {isComplete && (
        <CompletionDialog onClose={reset} />
      )}
    </div>
  )
}
