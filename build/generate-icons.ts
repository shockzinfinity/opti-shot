/**
 * Generate macOS-standard app icon using the lucide Aperture design.
 * Run: npx tsx build/generate-icons.ts
 *
 * Apple HIG macOS icon specifications:
 * - Canvas: 1024x1024
 * - Icon shape: 824x824 centered rounded-rect (80% of canvas)
 * - Corner radius: ~185px (at 824x824)
 * - Drop shadow: y=10, blur=20, color rgba(0,0,0,0.3)
 * - Background fill inside the rounded-rect
 * - Content fills ~60-70% of the icon shape
 *
 * References:
 * - https://developer.apple.com/design/human-interface-guidelines/app-icons
 * - https://developer.apple.com/forums/thread/670578
 */
import sharp from 'sharp'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const CANVAS = 1024
// macOS icon shape: 824x824 centered, with ~100px padding each side
const ICON_SIZE = 824
const ICON_OFFSET = (CANVAS - ICON_SIZE) / 2  // 100
const CORNER_RADIUS = 185

// Aperture content: ~65% of icon shape, centered within the rounded-rect
const CONTENT_PAD = ICON_OFFSET + ICON_SIZE * 0.17
const SCALE = (CANVAS - CONTENT_PAD * 2) / 24  // lucide viewBox 24x24

function lx(x: number) { return CONTENT_PAD + x * SCALE }
function ly(y: number) { return CONTENT_PAD + y * SCALE }

async function generateIcon() {
  const sw = 2 * SCALE  // stroke width

  const svg = `
    <svg width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- macOS standard drop shadow -->
        <filter id="shadow" x="-10%" y="-10%" width="130%" height="130%">
          <feDropShadow dx="0" dy="10" stdDeviation="15" flood-color="rgba(0,0,0,0.25)"/>
        </filter>
      </defs>

      <!-- Icon shape: rounded-rect with shadow (macOS standard) -->
      <rect
        x="${ICON_OFFSET}" y="${ICON_OFFSET}"
        width="${ICON_SIZE}" height="${ICON_SIZE}"
        rx="${CORNER_RADIUS}"
        fill="white"
        filter="url(#shadow)"
      />

      <!-- Aperture: exact lucide SVG paths -->
      <g stroke="#0062FF" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" fill="none">
        <circle cx="${lx(12)}" cy="${ly(12)}" r="${10 * SCALE}"/>
        <line x1="${lx(14.31)}" y1="${ly(8)}" x2="${lx(14.31 + 5.74)}" y2="${ly(8 + 9.94)}"/>
        <line x1="${lx(9.69)}" y1="${ly(8)}" x2="${lx(9.69 + 11.48)}" y2="${ly(8)}"/>
        <line x1="${lx(7.38)}" y1="${ly(12)}" x2="${lx(7.38 + 5.74)}" y2="${ly(12 - 9.94)}"/>
        <line x1="${lx(9.69)}" y1="${ly(16)}" x2="${lx(9.69 - 5.74)}" y2="${ly(16 - 9.94)}"/>
        <line x1="${lx(14.31)}" y1="${ly(16)}" x2="${lx(14.31 - 11.48)}" y2="${ly(16)}"/>
        <line x1="${lx(16.62)}" y1="${ly(12)}" x2="${lx(16.62 - 5.74)}" y2="${ly(12 + 9.94)}"/>
      </g>
    </svg>
  `

  const outputPath = join(__dirname, 'icon.png')
  await sharp(Buffer.from(svg)).resize(CANVAS, CANVAS).png().toFile(outputPath)
  console.log(`Generated: ${outputPath} (${CANVAS}x${CANVAS}, macOS HIG compliant)`)
}

generateIcon().catch(console.error)
