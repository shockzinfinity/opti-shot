// HEIC/HEIF support wrapper for sharp
// Converts HEIC to JPEG buffer once and caches per file path.

import { readFile } from 'fs/promises'
import { extname } from 'path'
import sharp from 'sharp'

const HEIC_EXTENSIONS = new Set(['.heic', '.heif'])

// Cache: filePath → JPEG buffer (avoids repeated heic-convert calls)
const jpegCache = new Map<string, Buffer>()

// Cache heic-convert module after first load
let heicConvert: ((opts: { buffer: Buffer | ArrayBuffer; format: 'JPEG'; quality: number }) => Promise<ArrayBuffer>) | null = null

/**
 * Check if a file is HEIC/HEIF format.
 */
export function isHeic(filePath: string): boolean {
  return HEIC_EXTENSIONS.has(extname(filePath).toLowerCase())
}

/**
 * Create a sharp instance from an image file path.
 * For non-HEIC: returns sharp(filePath) directly.
 * For HEIC: converts to JPEG buffer (cached per path) then returns sharp(buffer).
 */
export async function sharpFromPath(filePath: string): Promise<sharp.Sharp> {
  if (!isHeic(filePath)) {
    return sharp(filePath)
  }

  // Return cached JPEG buffer if available
  const cached = jpegCache.get(filePath)
  if (cached) {
    return sharp(cached)
  }

  // Convert and cache
  if (!heicConvert) {
    heicConvert = (await import('heic-convert')).default
  }
  const inputBuffer = await readFile(filePath)
  const jpegBuffer = Buffer.from(await heicConvert!({
    buffer: inputBuffer,
    format: 'JPEG',
    quality: 0.92,
  }))

  jpegCache.set(filePath, jpegBuffer)
  return sharp(jpegBuffer)
}

/**
 * Clear the HEIC conversion cache.
 * Call after scan completes to free memory.
 */
export function clearHeicCache(): void {
  jpegCache.clear()
}
