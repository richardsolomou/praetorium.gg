import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { compareCatalogueCoverage } from './lib/catalogueCoverageComparison'

const arguments_ = process.argv.slice(2)
const output = arguments_[0]
if (!output) {
  throw new Error(
    'usage: parallelCatalogueCoverage.ts <out.json> [--part <index>/<count>] [--compare <before.json>] [--accept <withdrawn.json>]',
  )
}
// A part takes every count-th faction, so machines can split the snapshot between them
// whatever worker count each one chooses.
const partAt = arguments_.indexOf('--part')
const part = partAt < 0 ? ['', '0', '1'] : arguments_[partAt + 1]?.match(/^(\d+)\/(\d+)$/)
if (!part || Number(part[2]) < 1 || Number(part[1]) >= Number(part[2])) {
  throw new Error('--part must be a zero-based index and count, for example 0/2')
}
const [partIndex, partCount] = [Number(part[1]), Number(part[2])]

const configuredWorkers = Number(process.env.CATALOGUE_COVERAGE_WORKERS ?? 3)
if (!Number.isInteger(configuredWorkers) || configuredWorkers < 1) throw new Error('CATALOGUE_COVERAGE_WORKERS must be a positive integer')
const workerCount = Math.min(configuredWorkers, os.availableParallelism(), 4)
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-coverage-'))
const script = path.join(import.meta.dirname, 'catalogueCoverage.ts')
const partialFiles = Array.from({ length: workerCount }, (_, index) => path.join(temporaryDirectory, `${index}.json`))

const runShard = (index: number) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        '--max-old-space-size=2048',
        '--import',
        'tsx',
        script,
        partialFiles[index]!,
        '--shard',
        `${partIndex + index * partCount}/${partCount * workerCount}`,
      ],
      { stdio: ['ignore', 'ignore', 'inherit'] },
    )
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0) {
        console.log(`coverage shard ${index + 1}/${workerCount} complete`)
        resolve()
      } else {
        reject(new Error(`coverage shard ${index + 1}/${workerCount} exited with ${signal ?? code}`))
      }
    })
  })

try {
  const results = await Promise.allSettled(partialFiles.map((_, index) => runShard(index)))
  const failure = results.find((result) => result.status === 'rejected')
  if (failure?.status === 'rejected') throw failure.reason
  const snapshot = partialFiles
    .flatMap((file) => JSON.parse(fs.readFileSync(file, 'utf8')) as { name: string }[])
    .toSorted((left, right) => left.name.localeCompare(right.name))
  fs.writeFileSync(output, JSON.stringify(snapshot, null, 1))

  const compareAt = arguments_.indexOf('--compare')
  const previous = compareAt < 0 ? undefined : arguments_[compareAt + 1]
  const acceptAt = arguments_.indexOf('--accept')
  const acceptFile = acceptAt < 0 ? undefined : arguments_[acceptAt + 1]
  const accepted: { reason: string; entries: string[] }[] = acceptFile ? JSON.parse(fs.readFileSync(acceptFile, 'utf8')) : []
  if (previous) compareCatalogueCoverage(previous, output, accepted)
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true })
}
