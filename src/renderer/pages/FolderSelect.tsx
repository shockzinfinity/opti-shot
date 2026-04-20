import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Rocket } from 'lucide-react'
import { useFolderStore } from '../stores/folder'
import { PageCloseButton } from '../components/PageCloseButton'
import { FolderList } from '../components/FolderList'
import { ScanModeSelector } from '../components/ScanModeSelector'
import { AdvancedSettings } from '../components/AdvancedSettings'
import { ExifFilterSection } from '../components/ExifFilterSection'
import { ActionBar } from '../components/ActionBar'
import { useTranslation } from '@renderer/hooks/useTranslation'

export function FolderSelect() {
  const navigate = useNavigate()
  const { folders, options, advancedOpen, enabledPlugins, addFolder, removeFolder, setMode, setOption, applyPreset, toggleAdvanced, reset } =
    useFolderStore()
  const { t } = useTranslation()

  // Reset on mount — fresh start every time
  useEffect(() => {
    reset()
  }, [reset])

  const handleStartScan = () => {
    if (folders.length === 0) return
    navigate('/scan')
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
          <h1 className="text-[28px] font-heading font-bold">{t('folders.title')}</h1>
          <p className="text-foreground-secondary mt-1">{t('folders.subtitle')}</p>
        </div>
        <PageCloseButton />
      </div>

      {/* Section 1: Scan Target Folders */}
      <div className="bg-surface-primary border border-border rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-foreground-primary">{t('folders.scanTargets')}</h2>
        </div>
        <FolderList folders={folders} onAdd={addFolder} onRemove={removeFolder} />
      </div>

      {/* Section 2: Scan Mode + Time Filter */}
      <div className="bg-surface-primary border border-border rounded-xl p-6">
        <ScanModeSelector
          mode={options.mode}
          dateStart={options.dateStart}
          dateEnd={options.dateEnd}
          onModeChange={setMode}
          onDateStartChange={(v) => setOption('dateStart', v)}
          onDateEndChange={(v) => setOption('dateEnd', v)}
        />
      </div>

      {/* Section 3: EXIF Filter (shown when enabled in settings) */}
      <ExifFilterSection options={options} onOptionChange={setOption} />

      {/* Section 4: Advanced Settings */}
      {enabledPlugins.length > 0 && (
        <AdvancedSettings
          open={advancedOpen}
          options={options}
          plugins={enabledPlugins}
          onToggle={toggleAdvanced}
          onOptionChange={setOption}
          onPresetChange={applyPreset}
        />
      )}

      {/* Section 4: Action Bar */}
      <ActionBar
        onCancel={handleCancel}
        onSubmit={handleStartScan}
        submitLabel={t('folders.startScan')}
        submitIcon={<Rocket className="w-4 h-4" />}
        submitDisabled={folders.length === 0}
      />
    </div>
  )
}
