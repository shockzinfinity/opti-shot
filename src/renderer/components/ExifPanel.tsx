import { useEffect, useState } from 'react'
import { X, Info } from 'lucide-react'
import { useTranslation } from '@renderer/hooks/useTranslation'

interface ExifPanelProps {
  photoId: string
  filename: string
  isMaster: boolean
  onClose: () => void
}

// EXIF keys to display in a readable order with grouping
const EXIF_GROUPS: Array<{ label: string; keys: string[] }> = [
  {
    label: 'Camera',
    keys: ['Make', 'Model', 'LensModel', 'LensMake', 'Software'],
  },
  {
    label: 'Capture',
    keys: [
      'DateTimeOriginal', 'CreateDate', 'ModifyDate',
      'ExposureTime', 'FNumber', 'ISO', 'FocalLength', 'FocalLengthIn35mmFormat',
      'ExposureProgram', 'ExposureMode', 'MeteringMode', 'WhiteBalance',
      'Flash', 'ExposureCompensation', 'BrightnessValue',
    ],
  },
  {
    label: 'Image',
    keys: [
      'ImageWidth', 'ImageHeight', 'ExifImageWidth', 'ExifImageHeight',
      'Orientation', 'ColorSpace', 'BitsPerSample', 'ComponentsConfiguration',
      'YCbCrPositioning', 'ResolutionUnit', 'XResolution', 'YResolution',
    ],
  },
  {
    label: 'GPS',
    keys: ['latitude', 'longitude', 'GPSAltitude', 'GPSSpeed', 'GPSImgDirection'],
  },
]

function formatExifValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    try {
      return new Date(value).toLocaleString()
    } catch {
      return value
    }
  }
  if (typeof value === 'number') {
    if (key === 'ExposureTime') {
      return value >= 1 ? `${value}s` : `1/${Math.round(1 / value)}s`
    }
    if (key === 'FNumber') return `f/${value}`
    if (key === 'FocalLength' || key === 'FocalLengthIn35mmFormat') return `${value}mm`
    if (key === 'latitude' || key === 'longitude') return value.toFixed(6)
    return String(value)
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.join(', ')
  return String(value)
}

function formatKeyLabel(key: string): string {
  // Convert camelCase/PascalCase to readable
  return key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
}

export function ExifPanel({ photoId, filename, isMaster, onClose }: ExifPanelProps) {
  const [exifData, setExifData] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const { t } = useTranslation()

  useEffect(() => {
    setLoading(true)
    window.electron.invoke('photos:exif', photoId).then((res: any) => {
      if (res?.success) {
        setExifData(res.data.exif)
      }
      setLoading(false)
    })
  }, [photoId])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Categorize exif entries
  const groupedEntries: Array<{ label: string; entries: Array<[string, unknown]> }> = []
  const usedKeys = new Set<string>()

  if (exifData) {
    for (const group of EXIF_GROUPS) {
      const entries: Array<[string, unknown]> = []
      for (const key of group.keys) {
        if (key in exifData) {
          entries.push([key, exifData[key]])
          usedKeys.add(key)
        }
      }
      if (entries.length > 0) {
        groupedEntries.push({ label: group.label, entries })
      }
    }

    // Remaining uncategorized keys
    const otherEntries: Array<[string, unknown]> = []
    for (const [key, value] of Object.entries(exifData)) {
      if (!usedKeys.has(key) && value !== undefined && value !== null) {
        otherEntries.push([key, value])
      }
    }
    if (otherEntries.length > 0) {
      groupedEntries.push({ label: 'Other', entries: otherEntries })
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-[400px] bg-surface-primary shadow-2xl z-50 flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Info className="w-4 h-4 text-primary shrink-0" />
            <h2 className="text-sm font-bold text-foreground-primary truncate">
              {filename}
            </h2>
            <span className={`shrink-0 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
              isMaster
                ? 'bg-primary text-white'
                : 'bg-foreground-muted/15 text-foreground-muted'
            }`}>
              {isMaster ? t('review.master') : t('review.duplicate')}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-foreground-muted hover:bg-surface-secondary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <span className="text-sm text-foreground-muted">{t('common.loading')}</span>
            </div>
          ) : !exifData || Object.keys(exifData).length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <span className="text-sm text-foreground-muted">{t('review.noExifData')}</span>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {groupedEntries.map((group) => (
                <div key={group.label} className="px-5 py-3">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-foreground-muted mb-2">
                    {group.label}
                  </h3>
                  <div className="space-y-1">
                    {group.entries.map(([key, value]) => (
                      <div key={key} className="flex justify-between gap-3 text-[11px]">
                        <span className="text-foreground-muted shrink-0">
                          {formatKeyLabel(key)}
                        </span>
                        <span className="font-mono text-foreground-primary text-right truncate" title={String(value)}>
                          {formatExifValue(key, value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
