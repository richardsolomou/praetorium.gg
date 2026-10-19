import fs from 'node:fs'
import { medianDurations, shardTitles, testTitles, recordedDurations } from './e2eShard.ts'

const [setup, ...files] = process.argv.slice(2)
if (!setup || !Number.isFinite(Number(setup)) || Number(setup) < 0 || files.length === 0)
  throw new Error('usage: benchmarkE2eRunners.ts <setup-seconds> <report.json>...')
const reports = files.map(
  (file) =>
    JSON.parse(fs.readFileSync(file, 'utf8')) as Parameters<typeof recordedDurations>[0] & {
      stats: { duration: number }
      config: { workers: number }
    },
)
const durations = medianDurations(reports)
const titles = [...new Set(reports.flatMap(testTitles))]
if (titles.some((title) => durations[title] === undefined)) throw new Error('benchmark requires a passing duration for every test')
if (reports.some((report) => report.config.workers !== 2)) throw new Error('benchmark requires two browser workers per runner')
const overheads = reports
  .map((report) =>
    Math.max(0, report.stats.duration / 1000 - Object.values(recordedDurations(report)).reduce((sum, seconds) => sum + seconds, 0) / 2),
  )
  .toSorted((left, right) => left - right)
const overhead = Number(setup) + overheads[Math.floor(overheads.length / 2)]!

console.log(
  `Modeled browser stage, ${titles.length} tests, two workers per runner, ${Math.round(overhead)}s overhead per runner; excludes build and external queue waits.`,
)
for (const slots of [4, 8, 16]) {
  for (const runners of [8, 16]) {
    const available = Array.from({ length: Math.min(slots, runners) }, () => 0)
    let runnerSeconds = 0
    for (let runner = 1; runner <= runners; runner++) {
      const work = shardTitles(titles, durations, runner, runners).reduce((sum, title) => sum + durations[title]!, 0)
      const seconds = overhead + work / 2
      const next = available.indexOf(Math.min(...available))
      available[next]! += seconds
      runnerSeconds += seconds
    }
    console.log(
      `${slots} available slots, ${runners} runners: ${Math.round(Math.max(...available))}s elapsed, ${Math.round(runnerSeconds / 60)} runner-minutes`,
    )
  }
}
