import { useState } from 'react'
import { Image, Star, Camera, Info, Trash2, Ban } from 'lucide-react'
import type { PhotoItem } from '@renderer/stores/review'
import { formatBytes, formatDateTime } from '@shared/utils'
import { useThumbnail } from '@renderer/hooks/useThumbnail'
import { useTranslation } from '@renderer/hooks/useTranslation'

interface PhotoThumbnailProps {
  photoId: string
  filename: string
}

function PhotoThumbnail({ photoId, filename }: PhotoThumbnailProps) {
  const [imgError, setImgError] = useState(false)
  const src = useThumbnail(photoId)

  if (src && !imgError) {
    return (
      <img
        src={src}
        alt={filename}
        className="w-full h-full object-cover"
        onError={() => setImgError(true)}
      />
    )
  }

  return (
    <div className="w-full h-full flex items-center justify-center bg-surface-secondary">
      <Image className="w-8 h-8 text-foreground-muted" />
    </div>
  )
}

interface PhotoGridProps {
  photos: PhotoItem[]
  onSelectMaster: (photoId: string) => void
  onViewExif?: (photoId: string, filename: string) => void
  pendingPhotoIds?: Set<string>
  trashedPhotoIds?: Set<string>
  purgedPhotoIds?: Set<string>
}

export function PhotoGrid({ photos, onSelectMaster, onViewExif, pendingPhotoIds, trashedPhotoIds, purgedPhotoIds }: PhotoGridProps) {
  const { t } = useTranslation()
  return (
    <div className="grid grid-cols-3 gap-3">
      {photos.map((photo) => {
        const isTrashed = trashedPhotoIds?.has(photo.id) ?? false
        const isPending = pendingPhotoIds?.has(photo.id) ?? false
        const isPurged = purgedPhotoIds?.has(photo.id) ?? false

        return (
        <div
          key={photo.id}
          className="bg-surface-primary rounded-xl shadow-sm hover:shadow-md opacity-80 hover:opacity-100 transition-all overflow-hidden group"
        >
          {/* Thumbnail */}
          <div className="aspect-square overflow-hidden bg-surface-secondary relative">
            <PhotoThumbnail photoId={photo.id} filename={photo.filename} />
            {/* Trash status badge — top-left corner */}
            {isPurged && (
              <div className="absolute top-1.5 left-1.5 bg-foreground-muted rounded-md px-1.5 py-0.5 flex items-center gap-1">
                <Ban className="w-2.5 h-2.5 text-white" />
                <span className="text-[9px] font-bold text-white">{t('review.permanentlyDeleted')}</span>
              </div>
            )}
            {isTrashed && !isPurged && (
              <div className="absolute top-1.5 left-1.5 bg-error rounded-md px-1.5 py-0.5 flex items-center gap-1">
                <Trash2 className="w-2.5 h-2.5 text-white" />
                <span className="text-[9px] font-bold text-white">{t('review.movedToTrash')}</span>
              </div>
            )}
            {isPending && !isTrashed && !isPurged && (
              <div className="absolute top-1.5 left-1.5 bg-warning rounded-md px-1.5 py-0.5 flex items-center gap-1">
                <Trash2 className="w-2.5 h-2.5 text-white" />
                <span className="text-[9px] font-bold text-white">{t('review.pendingTrash')}</span>
              </div>
            )}
            {/* Quality score overlay */}
            <div className="absolute bottom-1.5 right-1.5 bg-black/60 rounded-md px-1.5 py-0.5 flex items-center gap-1">
              <Star className="w-2.5 h-2.5 text-warning fill-warning" />
              <span className="text-[10px] font-mono font-bold text-white">
                {Math.round(photo.qualityScore)}
              </span>
            </div>
          </div>

          {/* Info */}
          <div className="p-2 space-y-1.5">
            <p className="text-[11px] text-foreground-secondary truncate font-mono" title={photo.filename}>
              {photo.filename}
            </p>
            <div className="bg-surface-secondary rounded-md p-1.5 text-[9px] space-y-0.5">
              <div className="flex justify-between">
                <span className="text-foreground-muted">{t('review.size')}</span>
                <span className="font-mono text-foreground-primary">{formatBytes(photo.fileSize)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-foreground-muted">{t('review.dimensions')}</span>
                <span className="font-mono text-foreground-primary">{photo.width > 0 ? `${photo.width}×${photo.height}` : '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-foreground-muted">{t('review.takenAt')}</span>
                <span className="font-mono text-foreground-primary">{formatDateTime(photo.takenAt) || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-foreground-muted">{t('review.camera')}</span>
                <span className="font-mono text-foreground-primary truncate ml-1">{photo.cameraModel || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-foreground-muted">ISO</span>
                <span className="font-mono text-foreground-primary">{photo.iso ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-foreground-muted">{t('review.shutter')}</span>
                <span className="font-mono text-foreground-primary">{photo.shutterSpeed || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-foreground-muted">{t('review.aperture')}</span>
                <span className="font-mono text-foreground-primary">{photo.aperture ? `f/${photo.aperture}` : '—'}</span>
              </div>
            </div>
            {onViewExif && (
              <button
                onClick={() => onViewExif(photo.id, photo.filename)}
                disabled={isPurged}
                className="w-full flex items-center justify-center gap-1 text-[9px] font-semibold py-1 rounded-md bg-surface-secondary text-foreground-muted hover:text-foreground-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Info className="w-2.5 h-2.5" />
                {t('review.viewAllExif')}
              </button>
            )}
            <button
              onClick={() => onSelectMaster(photo.id)}
              disabled={isTrashed || isPurged}
              className="w-full text-[11px] font-semibold py-1.5 rounded-lg border border-primary text-primary hover:bg-primary hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-primary"
            >
              {t('review.selectAsMaster')}
            </button>
          </div>
        </div>
        )
      })}
    </div>
  )
}
