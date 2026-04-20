import { useEffect, useState } from 'react'
import { Info } from 'lucide-react'
import { useTranslation } from '@renderer/hooks/useTranslation'
import { SidePanel, PanelSection, PanelRow, PanelEmpty } from './SidePanel'

interface ExifPanelProps {
  photoId: string
  filename: string
  isMaster: boolean
  onClose: () => void
}

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
  return key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
}

export function ExifPanel({ photoId, filename, isMaster, onClose }: ExifPanelProps) {
  const [exifData, setExifData] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const { t } = useTranslation()

  useEffect(() => {
    setLoading(true)
    window.electron.query('photo.exif', { photoId }).then((res) => {
      if (res.success) {
        setExifData((res.data as any).exif)
      }
      setLoading(false)
    })
  }, [photoId])

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

  const titleContent = (
    <div className="flex items-center gap-2 min-w-0">
      <h2 className="text-sm font-bold text-foreground-primary truncate">{filename}</h2>
      <span className={`shrink-0 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
        isMaster
          ? 'bg-primary text-white'
          : 'bg-foreground-muted/15 text-foreground-muted'
      }`}>
        {isMaster ? t('review.master') : t('review.duplicate')}
      </span>
    </div>
  )

  return (
    <SidePanel
      title={titleContent}
      icon={<Info className="w-4 h-4" />}
      onClose={onClose}
    >
      {loading ? (
        <PanelEmpty message={t('common.loading')} />
      ) : !exifData || Object.keys(exifData).length === 0 ? (
        <PanelEmpty message={t('review.noExifData')} />
      ) : (
        <div className="divide-y divide-border">
          {groupedEntries.map((group) => (
            <PanelSection key={group.label} title={group.label}>
              {group.entries.map(([key, value]) => (
                <PanelRow
                  key={key}
                  label={formatKeyLabel(key)}
                  value={formatExifValue(key, value)}
                />
              ))}
            </PanelSection>
          ))}
        </div>
      )}
    </SidePanel>
  )
}
