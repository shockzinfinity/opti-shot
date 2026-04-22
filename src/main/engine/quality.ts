// @TASK P2-R2 - Quality scoring via Laplacian variance
// @SPEC CLAUDE.md#Architecture — Quality Score: Laplacian variance

import { statSync } from 'fs'
import { sharpFromPath } from './heic'
import exifr from 'exifr'

/** EXIF/metadata extracted from image. */
export interface ExifData {
  width: number
  height: number
  format: string
  fileSize: number
  takenAt: string | null
  cameraModel: string | null
  lensModel: string | null
  iso: number | null
  shutterSpeed: string | null
  aperture: number | null
  focalLength: number | null
  latitude: number | null
  longitude: number | null
}

/** Lightweight EXIF data for pre-scan filtering (no sharp, exifr only). */
export interface QuickExifData {
  takenAt: Date | null
  cameraModel: string | null
  hasGps: boolean
  width: number
  height: number
}

const QUALITY_SIZE = 512

// 3x3 Laplacian kernel for edge/sharpness detection
// [[0, 1, 0], [1, -4, 1], [0, 1, 0]]
const LAPLACIAN_KERNEL = [0, 1, 0, 1, -4, 1, 0, 1, 0]

/**
 * Compute quality score (0-100) based on Laplacian variance.
 * Higher score = sharper image, lower score = blurrier image.
 *
 * Algorithm:
 * 1. Load image, resize to 512x512, greyscale
 * 2. Apply 3x3 Laplacian convolution
 * 3. Compute variance of convolved output
 * 4. Normalize to 0-100 scale
 */
export async function computeQualityScore(
  imagePath: string,
): Promise<number> {
  const sharpInstance = await sharpFromPath(imagePath)
  const { data, info } = await sharpInstance
    .resize(QUALITY_SIZE, QUALITY_SIZE, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const width = info.width
  const height = info.height

  // Apply Laplacian convolution (skip 1px border)
  const laplacianValues: number[] = []

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let sum = 0
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const pixelIdx = (y + ky) * width + (x + kx)
          const kernelIdx = (ky + 1) * 3 + (kx + 1)
          sum += data[pixelIdx] * LAPLACIAN_KERNEL[kernelIdx]
        }
      }
      laplacianValues.push(sum)
    }
  }

  // Compute variance
  const n = laplacianValues.length
  if (n === 0) return 0

  const mean = laplacianValues.reduce((s, v) => s + v, 0) / n
  const variance =
    laplacianValues.reduce((s, v) => s + (v - mean) ** 2, 0) / n

  // Normalize to 0-100 scale
  // Typical Laplacian variance range for real images: 0-2000+
  // Use sigmoid-like mapping: score = 100 * (1 - e^(-variance / scale))
  const SCALE = 500
  const score = 100 * (1 - Math.exp(-variance / SCALE))

  return Math.round(score * 100) / 100
}

/**
 * Extract basic EXIF/metadata from image using sharp.
 */
export async function getExifData(imagePath: string): Promise<ExifData> {
  const sharpInstance = await sharpFromPath(imagePath)
  const metadata = await sharpInstance.metadata()
  const stats = statSync(imagePath)

  let takenAt: string | null = null
  let cameraModel: string | null = null
  let lensModel: string | null = null
  let iso: number | null = null
  let shutterSpeed: string | null = null
  let aperture: number | null = null
  let focalLength: number | null = null

  let latitude: number | null = null
  let longitude: number | null = null

  try {
    // Single exifr.parse() call with gps:true for decimal GPS coordinates
    // Note: pick + gps:true → EXIF fields + converted lat/lon in one pass
    const exif = await exifr.parse(imagePath, {
      pick: [
        'DateTimeOriginal', 'Make', 'Model', 'LensModel',
        'ISO', 'ExposureTime', 'FNumber', 'FocalLength',
      ],
      gps: true,
    })
    if (exif) {
      if (exif.DateTimeOriginal instanceof Date) {
        takenAt = exif.DateTimeOriginal.toISOString()
      }
      cameraModel = [exif.Make, exif.Model].filter(Boolean).join(' ') || null
      lensModel = exif.LensModel || null
      iso = typeof exif.ISO === 'number' ? exif.ISO : null
      if (typeof exif.ExposureTime === 'number') {
        shutterSpeed = exif.ExposureTime >= 1
          ? `${exif.ExposureTime}s`
          : `1/${Math.round(1 / exif.ExposureTime)}s`
      }
      aperture = typeof exif.FNumber === 'number' ? exif.FNumber : null
      focalLength = typeof exif.FocalLength === 'number' ? exif.FocalLength : null
      // GPS: gps:true adds latitude/longitude as converted decimals
      latitude = typeof exif.latitude === 'number' ? exif.latitude : null
      longitude = typeof exif.longitude === 'number' ? exif.longitude : null
    }
  } catch {
    // EXIF not available — skip
  }

  return {
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    format: metadata.format ?? 'unknown',
    fileSize: stats.size,
    takenAt,
    cameraModel,
    lensModel,
    iso,
    shutterSpeed,
    aperture,
    focalLength,
    latitude,
    longitude,
  }
}

/**
 * Quick EXIF extraction for pre-scan filtering.
 * Uses only exifr (no sharp) for speed. Falls back to sharp for dimensions if EXIF lacks them.
 */
export async function getQuickExifForFilter(imagePath: string): Promise<QuickExifData> {
  let takenAt: Date | null = null
  let cameraModel: string | null = null
  let hasGps = false
  let width = 0
  let height = 0

  try {
    const exif = await exifr.parse(imagePath, {
      pick: [
        'DateTimeOriginal', 'Make', 'Model',
        'GPSLatitude', 'ImageWidth', 'ImageHeight',
        'ExifImageWidth', 'ExifImageHeight',
      ],
    })
    if (exif) {
      if (exif.DateTimeOriginal instanceof Date) {
        takenAt = exif.DateTimeOriginal
      }
      cameraModel = [exif.Make, exif.Model].filter(Boolean).join(' ') || null
      hasGps = exif.GPSLatitude != null
      width = exif.ExifImageWidth ?? exif.ImageWidth ?? 0
      height = exif.ExifImageHeight ?? exif.ImageHeight ?? 0
    }
  } catch {
    // EXIF not available
  }

  // Fallback to sharp for dimensions if EXIF didn't provide them
  if (width === 0 || height === 0) {
    try {
      const sharpInstance = await sharpFromPath(imagePath)
      const meta = await sharpInstance.metadata()
      width = meta.width ?? 0
      height = meta.height ?? 0
    } catch {
      // Cannot read dimensions
    }
  }

  return { takenAt, cameraModel, hasGps, width, height }
}
