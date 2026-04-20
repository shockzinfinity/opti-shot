import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Palette, Database, Info, RotateCcw, ScanSearch } from 'lucide-react'
import { useSettingsStore } from '@renderer/stores/settings'
import { PageCloseButton } from '@renderer/components/PageCloseButton'
import { ScanTab, UITab, DataTab, InfoTab } from '@renderer/components/SettingsTabs'
import { useTranslation } from '@renderer/hooks/useTranslation'
import type { TranslationKey } from '@renderer/i18n'

type TabId = 'scan' | 'ui' | 'data' | 'info'

interface TabConfig {
  id: TabId
  labelKey: TranslationKey
  icon: React.ReactNode
}

const TABS: TabConfig[] = [
  { id: 'scan', labelKey: 'settings.tabScan', icon: <ScanSearch className="w-4 h-4" /> },
  { id: 'ui', labelKey: 'settings.tabUi', icon: <Palette className="w-4 h-4" /> },
  { id: 'data', labelKey: 'settings.tabData', icon: <Database className="w-4 h-4" /> },
  { id: 'info', labelKey: 'settings.tabInfo', icon: <Info className="w-4 h-4" /> },
]

export function Settings() {
  const { activeTab, loading, loadSettings, setTab, resetSection } = useSettingsStore()
  const { t } = useTranslation()
  const location = useLocation()

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  useEffect(() => {
    const tab = (location.state as { tab?: string })?.tab
    if (tab === 'scan' || tab === 'ui' || tab === 'data' || tab === 'info') {
      setTab(tab)
    }
  }, [location.state, setTab])

  const handleResetDefaults = () => {
    const section = activeTab as 'scan' | 'ui' | 'data'
    if (activeTab !== 'info') {
      if (confirm(t('settings.resetDefaultsConfirm'))) {
        resetSection(section)
      }
    }
  }

  return (
    <div className="max-w-[800px] mx-auto p-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[28px] font-heading font-bold text-foreground-primary">{t('settings.title')}</h1>
          <p className="text-sm text-foreground-muted mt-1">{t('settings.subtitle')}</p>
        </div>
        <PageCloseButton />
      </div>

      {/* Tab Bar */}
      <div className="flex border-b border-border gap-1">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold transition-colors relative ${
                isActive
                  ? 'text-primary border-b-2 border-primary -mb-px'
                  : 'text-foreground-muted hover:text-foreground-primary'
              }`}
            >
              {tab.icon}
              {t(tab.labelKey)}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div>
          {activeTab === 'scan' && <ScanTab />}
          {activeTab === 'ui' && <UITab />}
          {activeTab === 'data' && <DataTab />}
          {activeTab === 'info' && <InfoTab />}
        </div>
      )}

      {/* Bottom: Reset defaults only */}
      {activeTab !== 'info' && (
        <div className="pt-6 border-t border-border">
          <button
            onClick={handleResetDefaults}
            className="flex items-center gap-2 text-sm text-foreground-muted hover:text-foreground-secondary transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            {t('settings.resetDefaults')}
          </button>
        </div>
      )}
    </div>
  )
}
