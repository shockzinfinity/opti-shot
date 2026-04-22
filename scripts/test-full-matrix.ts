/**
 * Full matrix test — all presets + individual algorithm combinations
 *   npx tsx scripts/test-full-matrix.ts
 */
import { ScanEngine } from '../src/main/engine/scan-engine'
import { phashAlgorithm } from '../src/main/engine/algorithms/phash'
import { dhashAlgorithm } from '../src/main/engine/algorithms/dhash'
import { ssimAlgorithm } from '../src/main/engine/algorithms/ssim'
import { nmseAlgorithm } from '../src/main/engine/algorithms/nmse'
import { SCAN_PRESETS } from '../src/shared/constants'
import { readdirSync } from 'fs'
import { join, extname } from 'path'

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.heic', '.heif'])
const folder = './download2'

const files = readdirSync(folder)
  .filter(f => IMAGE_EXTS.has(extname(f).toLowerCase()))
  .map(f => join(folder, f))

console.log(`Found ${files.length} images in ${folder}\n`)

const algoMap = {
  phash: phashAlgorithm,
  dhash: dhashAlgorithm,
  ssim: ssimAlgorithm,
  nmse: nmseAlgorithm,
}

interface TestResult {
  name: string
  groups: Array<{ files: string[]; master: string }>
  elapsed: number
  skipped: number
}

async function runTest(name: string, config: {
  hashAlgorithms: string[]
  hashThresholds: Record<string, number>
  mergeStrategy: 'union' | 'intersection'
  verifyAlgorithms: string[]
  verifyThresholds: Record<string, number>
}): Promise<TestResult> {
  const hashAlgos = config.hashAlgorithms.map(id => algoMap[id as keyof typeof algoMap]).filter(Boolean) as typeof phashAlgorithm[]
  const verifyAlgos = config.verifyAlgorithms.map(id => algoMap[id as keyof typeof algoMap]).filter(Boolean) as typeof ssimAlgorithm[]

  const engine = new ScanEngine({
    hashAlgorithms: hashAlgos,
    hashThresholds: config.hashThresholds,
    mergeStrategy: config.mergeStrategy,
    verifyAlgorithms: verifyAlgos,
    verifyThresholds: config.verifyThresholds,
    batchSize: 100,
  })

  const result = await engine.scanFiles(files, () => {})

  return {
    name,
    groups: result.groups.map(g => ({
      files: g.photos.map(p => p.path.split('/').pop()!).sort(),
      master: g.photos.find(p => p.id === g.masterId)?.path.split('/').pop() ?? '',
    })),
    elapsed: result.elapsed,
    skipped: result.skippedFiles.length,
  }
}

function printResult(r: TestResult) {
  console.log(`\n${'─'.repeat(70)}`)
  console.log(`  ${r.name}`)
  console.log(`  ${r.groups.length} groups | ${r.elapsed.toFixed(1)}s | ${r.skipped} skipped`)
  console.log(`${'─'.repeat(70)}`)
  if (r.groups.length === 0) {
    console.log('  (no groups found)')
  }
  for (const g of r.groups) {
    console.log(`  [${g.files.join(', ')}] master=${g.master}`)
  }
}

async function main() {
  const results: TestResult[] = []

  // ========================================
  // Part 1: All presets (from constants.ts)
  // ========================================
  console.log('\n' + '='.repeat(70))
  console.log('  PART 1: PRESETS (from shared/constants.ts)')
  console.log('='.repeat(70))

  for (const [id, preset] of Object.entries(SCAN_PRESETS)) {
    const r = await runTest(`Preset: ${id}`, preset)
    results.push(r)
    printResult(r)
  }

  // ========================================
  // Part 2: Individual algorithm combos
  // ========================================
  console.log('\n' + '='.repeat(70))
  console.log('  PART 2: INDIVIDUAL ALGORITHM COMBINATIONS')
  console.log('='.repeat(70))

  // pHash only (various thresholds)
  for (const t of [4, 6, 8, 10, 12]) {
    const r = await runTest(`pHash only (threshold=${t})`, {
      hashAlgorithms: ['phash'], hashThresholds: { phash: t },
      mergeStrategy: 'union', verifyAlgorithms: [], verifyThresholds: {},
    })
    results.push(r)
    printResult(r)
  }

  // dHash only (various thresholds)
  for (const t of [4, 6, 8, 10, 12]) {
    const r = await runTest(`dHash only (threshold=${t})`, {
      hashAlgorithms: ['dhash'], hashThresholds: { dhash: t },
      mergeStrategy: 'union', verifyAlgorithms: [], verifyThresholds: {},
    })
    results.push(r)
    printResult(r)
  }

  // pHash + SSIM (various SSIM thresholds)
  for (const s of [0.75, 0.80, 0.82, 0.85, 0.90, 0.95]) {
    const r = await runTest(`pHash(8) + SSIM(${s})`, {
      hashAlgorithms: ['phash'], hashThresholds: { phash: 8 },
      mergeStrategy: 'union', verifyAlgorithms: ['ssim'], verifyThresholds: { ssim: s },
    })
    results.push(r)
    printResult(r)
  }

  // dHash + SSIM (various SSIM thresholds)
  for (const s of [0.75, 0.80, 0.82, 0.85, 0.90]) {
    const r = await runTest(`dHash(8) + SSIM(${s})`, {
      hashAlgorithms: ['dhash'], hashThresholds: { dhash: 8 },
      mergeStrategy: 'union', verifyAlgorithms: ['ssim'], verifyThresholds: { ssim: s },
    })
    results.push(r)
    printResult(r)
  }

  // pHash + dHash Union vs Intersection
  const r1 = await runTest('pHash(8)+dHash(8) Union, no verify', {
    hashAlgorithms: ['phash', 'dhash'], hashThresholds: { phash: 8, dhash: 8 },
    mergeStrategy: 'union', verifyAlgorithms: [], verifyThresholds: {},
  })
  results.push(r1)
  printResult(r1)

  const r2 = await runTest('pHash(8)+dHash(8) Intersection, no verify', {
    hashAlgorithms: ['phash', 'dhash'], hashThresholds: { phash: 8, dhash: 8 },
    mergeStrategy: 'intersection', verifyAlgorithms: [], verifyThresholds: {},
  })
  results.push(r2)
  printResult(r2)

  // NMSE standalone verify
  const r3 = await runTest('pHash(8) + NMSE(0.05)', {
    hashAlgorithms: ['phash'], hashThresholds: { phash: 8 },
    mergeStrategy: 'union', verifyAlgorithms: ['nmse'], verifyThresholds: { nmse: 0.05 },
  })
  results.push(r3)
  printResult(r3)

  const r4 = await runTest('pHash(8) + NMSE(0.10)', {
    hashAlgorithms: ['phash'], hashThresholds: { phash: 8 },
    mergeStrategy: 'union', verifyAlgorithms: ['nmse'], verifyThresholds: { nmse: 0.10 },
  })
  results.push(r4)
  printResult(r4)

  // ========================================
  // Part 3: Summary table
  // ========================================
  console.log('\n' + '='.repeat(70))
  console.log('  SUMMARY TABLE')
  console.log('='.repeat(70))
  console.log(`${'Name'.padEnd(45)} | Groups | Time`)
  console.log('-'.repeat(70))
  for (const r of results) {
    const groupDesc = r.groups.length === 0 ? '0' :
      `${r.groups.length} (${r.groups.map(g => g.files.length).join('+')} files)`
    console.log(`${r.name.padEnd(45)} | ${groupDesc.padEnd(20)} | ${r.elapsed.toFixed(1)}s`)
  }

  // ========================================
  // Part 4: IMG_0037/38/39 focus
  // ========================================
  console.log('\n' + '='.repeat(70))
  console.log('  IMG_0037/0038/0039 GROUPING ACROSS ALL TESTS')
  console.log('='.repeat(70))
  const targets = ['IMG_0037.JPEG', 'IMG_0038.JPEG', 'IMG_0039.JPEG']
  for (const r of results) {
    const relevantGroups = r.groups.filter(g =>
      g.files.some(f => targets.includes(f))
    )
    if (relevantGroups.length > 0) {
      const members = relevantGroups.flatMap(g => g.files.filter(f => targets.includes(f)))
      console.log(`${r.name.padEnd(45)} → [${members.join(', ')}]`)
    } else {
      console.log(`${r.name.padEnd(45)} → (not grouped)`)
    }
  }
}

main().catch(console.error)
