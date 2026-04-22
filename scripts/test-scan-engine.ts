/**
 * Direct ScanEngine test — tests the full pipeline without Electron
 *   npx tsx scripts/test-scan-engine.ts
 */
import { ScanEngine } from '../src/main/engine/scan-engine'
import { phashAlgorithm } from '../src/main/engine/algorithms/phash'
import { dhashAlgorithm } from '../src/main/engine/algorithms/dhash'
import { ssimAlgorithm } from '../src/main/engine/algorithms/ssim'
import { nmseAlgorithm } from '../src/main/engine/algorithms/nmse'
import { readdirSync } from 'fs'
import { join, extname } from 'path'

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.heic', '.heif'])
const folder = './download2'

// Collect image files
const files = readdirSync(folder)
  .filter(f => IMAGE_EXTS.has(extname(f).toLowerCase()))
  .map(f => join(folder, f))

console.log(`Found ${files.length} images in ${folder}\n`)

async function runPreset(name: string, config: {
  hashAlgorithms: typeof phashAlgorithm[]
  hashThresholds: Record<string, number>
  mergeStrategy: 'union' | 'intersection'
  verifyAlgorithms: typeof ssimAlgorithm[]
  verifyThresholds: Record<string, number>
}) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`Preset: ${name}`)
  console.log(`  Hash: [${config.hashAlgorithms.map(a => a.id).join(', ')}]`)
  console.log(`  Thresholds: ${JSON.stringify(config.hashThresholds)}`)
  console.log(`  Merge: ${config.mergeStrategy}`)
  console.log(`  Verify: [${config.verifyAlgorithms.map(a => a.id).join(', ')}]`)
  console.log(`  Verify Thresholds: ${JSON.stringify(config.verifyThresholds)}`)
  console.log(`${'='.repeat(60)}`)

  const engine = new ScanEngine({
    hashAlgorithms: config.hashAlgorithms,
    hashThresholds: config.hashThresholds,
    mergeStrategy: config.mergeStrategy,
    verifyAlgorithms: config.verifyAlgorithms,
    verifyThresholds: config.verifyThresholds,
    batchSize: 100,
  })

  const result = await engine.scanFiles(files, () => {})

  console.log(`\nResults: ${result.groups.length} groups, ${result.processedFiles} files processed, ${result.skippedFiles.length} skipped`)
  console.log(`Elapsed: ${result.elapsed.toFixed(1)}s`)

  for (const group of result.groups) {
    const master = group.photos.find(p => p.id === group.masterId)
    console.log(`\n  Group (${group.photos.length} photos, master: ${master?.path.split('/').pop()}):`)
    for (const photo of group.photos) {
      const isMaster = photo.id === group.masterId ? ' ★' : ''
      console.log(`    ${photo.path.split('/').pop()} (quality: ${photo.qualityScore.toFixed(1)})${isMaster}`)
    }
  }
}

async function main() {
  // 1. 균형: pHash+dHash(Union) + SSIM(0.82)
  await runPreset('균형 (balanced)', {
    hashAlgorithms: [phashAlgorithm, dhashAlgorithm],
    hashThresholds: { phash: 8, dhash: 8 },
    mergeStrategy: 'union',
    verifyAlgorithms: [ssimAlgorithm],
    verifyThresholds: { ssim: 0.82 },
  })

  // 2. 빠른: dHash(8) + SSIM(0.75) — 가벼운 검증으로 오탐 줄임
  await runPreset('빠른 (fast)', {
    hashAlgorithms: [dhashAlgorithm],
    hashThresholds: { dhash: 8 },
    mergeStrategy: 'union',
    verifyAlgorithms: [ssimAlgorithm],
    verifyThresholds: { ssim: 0.75 },
  })

  // 3. 보수적: pHash(6) + SSIM(0.85)
  await runPreset('보수적 (conservative)', {
    hashAlgorithms: [phashAlgorithm],
    hashThresholds: { phash: 6 },
    mergeStrategy: 'union',
    verifyAlgorithms: [ssimAlgorithm],
    verifyThresholds: { ssim: 0.85 },
  })

  // 4. 정밀: pHash+dHash(Intersection) + SSIM(0.82) → NMSE(0.05)
  await runPreset('정밀 (precise)', {
    hashAlgorithms: [phashAlgorithm, dhashAlgorithm],
    hashThresholds: { phash: 8, dhash: 8 },
    mergeStrategy: 'intersection',
    verifyAlgorithms: [ssimAlgorithm, nmseAlgorithm],
    verifyThresholds: { ssim: 0.82, nmse: 0.05 },
  })

  // 5. 레거시 호환: pHash only + SSIM(0.82)
  await runPreset('레거시 호환 (pHash+SSIM)', {
    hashAlgorithms: [phashAlgorithm],
    hashThresholds: { phash: 8 },
    mergeStrategy: 'union',
    verifyAlgorithms: [ssimAlgorithm],
    verifyThresholds: { ssim: 0.82 },
  })
}

main().catch(console.error)
