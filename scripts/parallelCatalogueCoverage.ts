import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { parsePart } from './lib/part'

const {
  positionals: [output],
  values,
} = parseArgs({ allowPositionals: true, options: { part: { type: 'string' } } })
if (!output) {
  throw new Error('usage: parallelCatalogueCoverage.ts <out.json> [--part <index>/<count>]')
}
// A part takes every count-th faction, so machines can split the snapshot between them
// whatever worker count each one chooses.
const { index: partIndex, count: partCount } = values.part === undefined ? { index: 0, count: 1 } : parsePart(values.part, '--part')

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
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true })
}
