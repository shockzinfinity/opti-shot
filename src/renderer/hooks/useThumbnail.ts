import { useState, useEffect } from 'react'
import { IPC } from '@shared/types'

// Simple in-memory cache
const thumbnailCache = new Map<string, string>()

export function useThumbnail(photoId: string): string | null {
  const cached = thumbnailCache.get(photoId)
  const [src, setSrc] = useState<string | null>(cached ?? null)

  useEffect(() => {
    if (thumbnailCache.has(photoId)) {
      setSrc(thumbnailCache.get(photoId)!)
      return
    }

    let cancelled = false
    window.electron.invoke(IPC.PHOTOS.THUMBNAIL, photoId).then((result: any) => {
      if (!cancelled && result?.success && result.data) {
        thumbnailCache.set(photoId, result.data)
        setSrc(result.data)
      }
    })

    return () => { cancelled = true }
  }, [photoId])

  return src
}

/** Clear thumbnail cache (call after scan history reset) */
export function clearThumbnailCache(): void {
  thumbnailCache.clear()
}
