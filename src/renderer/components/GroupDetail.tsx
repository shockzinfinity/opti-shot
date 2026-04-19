import { useState } from 'react'
import { Image, Maximize2, Camera, Star, Info } from 'lucide-react'
import { useReviewStore } from '@renderer/stores/review'
import { PhotoGrid } from './PhotoGrid'
import { ExifPanel } from './ExifPanel'
import type { PhotoItem } from '@renderer/stores/review'
import { formatBytes, formatDateTime } from '@shared/utils'
import { useThumbnail } from '@renderer/hooks/useThumbnail'
import { useTranslation } from '@renderer/hooks/useTranslation'

interface MasterThumbnailProps {
  photo: PhotoItem
}

function MasterThumbnail({ photo }: MasterThumbnailProps) {
  const [imgError, setImgError] = useState(false)
  const src = useThumbnail(photo.id)

  if (src && !imgError) {
    return (
      <img
        src={src}
        alt={photo.filename}
        className="w-full h-full object-contain bg-surface-secondary"
        onError={() => setImgError(true)}
      />
    )
  }

  return (
    <div className="w-full h-full flex items-center justify-center bg-surface-secondary">
      <Image className="w-12 h-12 text-foreground-muted" />
    </div>
  )
}

export function GroupDetail() {
  const { groupDetail, detailLoading, changeMaster, pendingDeletions } = useReviewStore()
  const { t } = useTranslation()
  const [exifTarget, setExifTarget] = useState<{ id: string; filename: string } | null>(null)

  if (detailLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-foreground-muted text-sm">{t('review.loadingGroup')}</span>
      </div>
    )
  }

  if (!groupDetail) return null

  const masterPhoto = groupDetail.photos.find((p) => p.id === groupDetail.masterId)
  const duplicates = groupDetail.photos.filter((p) => p.id !== groupDetail.masterId)
  const pendingPhotoIds = new Set(pendingDeletions.filter((d) => d.groupId === groupDetail.id).map((d) => d.photoId))
  const trashedPhotoIds = new Set(duplicates.filter((p) => p.trashStatus === 'trashed').map((p) => p.id))
  const purgedPhotoIds = new Set(duplicates.filter((p) => p.trashStatus === 'purged').map((p) => p.id))
  const isGroupPurged = purgedPhotoIds.size > 0

  return (
    <div className="flex-1 overflow-y-auto p-6 pb-24">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left: Master Photo Card */}
        <div className="xl:col-span-5">
          <h3 className="text-xs font-black uppercase tracking-widest text-foreground-muted mb-3">
            {t('review.masterPhoto')}
          </h3>
          <div className="bg-surface-primary rounded-xl border-2 border-primary shadow-lg ring-4 ring-primary/5 overflow-hidden">
            {/* Thumbnail */}
            <div className="aspect-[4/3] relative overflow-hidden">
              {masterPhoto ? (
                <MasterThumbnail photo={masterPhoto} />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-surface-secondary">
                  <Image className="w-12 h-12 text-foreground-muted" />
                </div>
              )}
              {/* MASTER badge */}
              <div className="absolute top-3 left-3">
                <span className="bg-primary text-white px-3 py-1.5 rounded-full text-[10px] font-black tracking-wider uppercase">
                  {t('review.master')}
                </span>
              </div>
            </div>

            {/* Info panel */}
            <div className="p-3 space-y-3">
              {masterPhoto ? (
                <>
                  {/* Filename + quality */}
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground-primary truncate" title={masterPhoto.filename}>
                      {masterPhoto.filename}
                    </p>
                    <div className="flex items-center gap-1.5 shrink-0 bg-primary/10 px-2 py-0.5 rounded-full">
                      <span className="text-[10px] text-primary">{t('review.quality')}</span>
                      <span className="text-sm font-black text-primary font-heading">
                        {Math.round(masterPhoto.qualityScore)}
                      </span>
                    </div>
                  </div>

                  {/* Compact info table */}
                  <div className="bg-surface-secondary rounded-lg p-2 text-[11px] space-y-1">
                    <div className="flex justify-between">
                      <span className="text-foreground-muted">{t('review.size')}</span>
                      <span className="font-mono text-foreground-primary">{formatBytes(masterPhoto.fileSize)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-foreground-muted">{t('review.dimensions')}</span>
                      <span className="font-mono text-foreground-primary">{masterPhoto.width > 0 ? `${masterPhoto.width}×${masterPhoto.height}` : '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-foreground-muted">{t('review.takenAt')}</span>
                      <span className="font-mono text-foreground-primary">{formatDateTime(masterPhoto.takenAt) || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-foreground-muted">{t('review.camera')}</span>
                      <span className="font-mono text-foreground-primary truncate ml-2" title={masterPhoto.cameraModel ?? undefined}>{masterPhoto.cameraModel || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-foreground-muted">ISO</span>
                      <span className="font-mono text-foreground-primary">{masterPhoto.iso ?? '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-foreground-muted">{t('review.shutter')}</span>
                      <span className="font-mono text-foreground-primary">{masterPhoto.shutterSpeed || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-foreground-muted">{t('review.aperture')}</span>
                      <span className="font-mono text-foreground-primary">{masterPhoto.aperture ? `f/${masterPhoto.aperture}` : '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-foreground-muted">{t('review.focalLength')}</span>
                      <span className="font-mono text-foreground-primary">{masterPhoto.focalLength ? `${masterPhoto.focalLength}mm` : '—'}</span>
                    </div>
                  </div>

                  {/* EXIF detail button */}
                  <button
                    onClick={() => setExifTarget({ id: masterPhoto.id, filename: masterPhoto.filename })}
                    className="w-full flex items-center justify-center gap-1.5 text-[10px] font-semibold py-1.5 rounded-lg bg-surface-secondary text-foreground-secondary hover:bg-border transition-colors"
                  >
                    <Info className="w-3 h-3" />
                    {t('review.viewAllExif')}
                  </button>

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => {
                        window.electron.command('shell.openPath', { filePath: masterPhoto.path })
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-xl border border-border text-foreground-secondary hover:bg-surface-secondary transition-colors"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                      {t('review.viewOriginal')}
                    </button>
                    <button
                      onClick={() => {
                        // Remove master — select the highest quality duplicate as new master
                        if (duplicates.length > 0) {
                          const best = [...duplicates].sort(
                            (a, b) => b.qualityScore - a.qualityScore
                          )[0]
                          changeMaster(best.id)
                        }
                      }}
                      disabled={duplicates.length === 0 || isGroupPurged}
                      className="flex-1 text-xs font-semibold py-2 rounded-xl border border-error/40 text-error hover:bg-error-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {t('review.removeAsMaster')}
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-foreground-muted">{t('review.noMaster')}</p>
              )}
            </div>
          </div>
        </div>

        {/* Right: Duplicates Grid */}
        <div className="xl:col-span-7">
          <h3 className="text-xs font-black uppercase tracking-widest text-foreground-muted mb-3">
            {t('review.duplicates')} ({duplicates.length})
          </h3>
          {duplicates.length === 0 ? (
            <div className="flex items-center justify-center h-32 bg-surface-secondary rounded-xl">
              <p className="text-sm text-foreground-muted">{t('review.noDuplicates')}</p>
            </div>
          ) : (
            <PhotoGrid photos={duplicates} onSelectMaster={changeMaster} onViewExif={(id, filename) => setExifTarget({ id, filename })} pendingPhotoIds={pendingPhotoIds} trashedPhotoIds={trashedPhotoIds} purgedPhotoIds={purgedPhotoIds} />
          )}
        </div>
      </div>

      {/* EXIF Slide Panel */}
      {exifTarget && (
        <ExifPanel
          photoId={exifTarget.id}
          filename={exifTarget.filename}
          isMaster={exifTarget.id === groupDetail?.masterId}
          onClose={() => setExifTarget(null)}
        />
      )}
    </div>
  )
}
