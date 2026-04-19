// @TASK P2-R2 - Test image generation utilities
// @SPEC CLAUDE.md#Performance-Targets

import sharp from 'sharp'
import { join } from 'path'
import { mkdirSync, existsSync } from 'fs'

const FIXTURE_BASE = join(__dirname, 'images')

/**
 * Get a namespaced fixture directory to avoid cross-test-file conflicts.
 * Each test file should use a unique namespace.
 */
export function getFixtureDir(namespace = 'default'): string {
  const dir = join(FIXTURE_BASE, namespace)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

/** Current namespace for fixture path resolution. */
let currentNamespace = 'default'

/** Set the active namespace (call in beforeAll). */
export function setFixtureNamespace(ns: string): void {
  currentNamespace = ns
}

export function fixturePath(name: string): string {
  return join(getFixtureDir(currentNamespace), name)
}

/**
 * Generate a solid color image (100x100 PNG).
 */
export async function generateSolidImage(
  filename: string,
  color: { r: number; g: number; b: number },
  size = 100,
): Promise<string> {
  const outPath = fixturePath(filename)
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: color,
    },
  })
    .png()
    .toFile(outPath)
  return outPath
}

/**
 * Generate a gradient image (horizontal gradient from black to white).
 */
export async function generateGradientImage(
  filename: string,
  size = 100,
): Promise<string> {
  const outPath = fixturePath(filename)
  const pixels = Buffer.alloc(size * size * 3)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 3
      const val = Math.round((x / (size - 1)) * 255)
      pixels[idx] = val
      pixels[idx + 1] = val
      pixels[idx + 2] = val
    }
  }
  await sharp(pixels, { raw: { width: size, height: size, channels: 3 } })
    .png()
    .toFile(outPath)
  return outPath
}

/**
 * Generate a blurred version of an existing image.
 */
export async function generateBlurredImage(
  sourcePath: string,
  filename: string,
  sigma = 10,
): Promise<string> {
  const outPath = fixturePath(filename)
  await sharp(sourcePath).blur(sigma).toFile(outPath)
  return outPath
}

/**
 * Generate a high-frequency pattern image (checkerboard) that is "sharp".
 */
export async function generateCheckerboardImage(
  filename: string,
  size = 100,
  blockSize = 4,
): Promise<string> {
  const outPath = fixturePath(filename)
  const pixels = Buffer.alloc(size * size * 3)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 3
      const isWhite =
        (Math.floor(x / blockSize) + Math.floor(y / blockSize)) % 2 === 0
      const val = isWhite ? 255 : 0
      pixels[idx] = val
      pixels[idx + 1] = val
      pixels[idx + 2] = val
    }
  }
  await sharp(pixels, { raw: { width: size, height: size, channels: 3 } })
    .png()
    .toFile(outPath)
  return outPath
}

/**
 * Generate a noisy image (random pixel values).
 */
export async function generateNoiseImage(
  filename: string,
  size = 100,
): Promise<string> {
  const outPath = fixturePath(filename)
  const pixels = Buffer.alloc(size * size * 3)
  for (let i = 0; i < pixels.length; i++) {
    pixels[i] = Math.floor(Math.random() * 256)
  }
  await sharp(pixels, { raw: { width: size, height: size, channels: 3 } })
    .png()
    .toFile(outPath)
  return outPath
}

/**
 * Generate a near-duplicate by slightly modifying pixel values.
 */
export async function generateNearDuplicate(
  sourcePath: string,
  filename: string,
  brightnessShift = 5,
): Promise<string> {
  const outPath = fixturePath(filename)
  await sharp(sourcePath)
    .modulate({ brightness: 1 + brightnessShift / 100 })
    .toFile(outPath)
  return outPath
}
