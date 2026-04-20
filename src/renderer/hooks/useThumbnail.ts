import { useState, useEffect } from 'react'

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
    window.electron.query('photo.thumbnail', { photoId }).then((result) => {
      if (!cancelled && result.success && result.data) {
        thumbnailCache.set(photoId, result.data as string)
        setSrc(result.data as string)
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
