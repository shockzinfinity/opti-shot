import { useEffect, useRef } from 'react'
import { FixedSizeList } from 'react-window'
import { CheckCircle } from 'lucide-react'
import type { Discovery } from '../stores/scan'
import { useTranslation } from '@renderer/hooks/useTranslation'

interface DiscoveryFeedProps {
  discoveries: Discovery[]
}

export function DiscoveryFeed({ discoveries }: DiscoveryFeedProps) {
  const listRef = useRef<FixedSizeList>(null)
  const { t } = useTranslation()

  useEffect(() => {
    if (discoveries.length > 0) {
      listRef.current?.scrollToItem(discoveries.length - 1)
    }
  }, [discoveries.length])

  return (
    <div className="bg-surface-primary rounded-xl border border-border p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h2 className="text-base font-heading font-semibold text-foreground-primary">
          {t('scan.recentDiscoveries')}
        </h2>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-success-light text-success border border-success/20">
          <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
          {t('scan.autoScroll')}
        </span>
      </div>

      {/* Feed */}
      {discoveries.length === 0 ? (
        <p className="text-sm text-foreground-muted py-4 text-center">
          {t('scan.noGroups')}
        </p>
      ) : (
        <FixedSizeList
          ref={listRef}
          height={Math.min(discoveries.length * 56, 300)}
          width="100%"
          itemCount={discoveries.length}
          itemSize={56}
        >
          {({ index, style }) => {
            const item = discoveries[index]
            return (
              <div style={style} className="pr-1">
                <div
                  key={`${item.groupNumber}-${item.timestamp}`}
                  className="flex items-start gap-3 p-3 rounded-xl bg-surface-secondary"
                >
                  <CheckCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-foreground-primary">
                        Group {item.groupNumber}: {item.fileCount} files, {item.totalSize}
                      </span>
                      <span className="text-xs text-foreground-muted shrink-0 font-mono">
                        {item.timestamp}
                      </span>
                    </div>
                    <p className="text-xs text-foreground-muted font-mono truncate mt-0.5">
                      {item.masterFilename}
                    </p>
                  </div>
                </div>
              </div>
            )
          }}
        </FixedSizeList>
      )}
    </div>
  )
}
