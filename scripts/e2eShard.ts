/**
 * Splits the end-to-end suite across CI runners by recorded test duration.
 *
 * Playwright shards by test count, and a handful of long journeys decide how long a
 * runner takes, so count-based shards finished minutes apart. Packing the longest
 * tests first onto the least-loaded runner keeps every runner near the mean, and
 * sizing the runner count by the tests' total weight keeps a small selection from
 * paying every runner's startup.
 *
 * `tsx scripts/e2eShard.ts --plan <tests.json> <dir> <most runners> [desktop slots]` reads the
 * JSON reporter's `--list` output, writes each runner's tests to `<dir>/<runner>.txt` for
 * `playwright test --test-list`, and prints `{ count, desktop }`: how many runners it planned
 * and which of them the desktop takes.
 * `tsx scripts/e2eShard.ts --record <report.json>...` updates e2e/durations.json from
 * JSON reports, taking each test's median across the runs they cover and dropping tests
 * the reports no longer list; a test missing from it weighs as much as the median.
 */
import fs from 'node:fs'
import path from 'node:path'
import { isEntryPoint } from './lib/entryPoint.ts'

type Attachment = { name: string; path?: string }
type SpecReport = { title: string; tests?: { results?: { status: string; duration: number; attachments?: Attachment[] }[] }[] }
type Suite = { title: string; file: string; specs?: SpecReport[]; suites?: Suite[] }
export type Report = { suites: Suite[] }
type Durations = Record<string, number>

const durationsFile = path.join(import.meta.dirname, '..', 'e2e', 'durations.json')

export function specsOf(report: Report) {
  const specs: { title: string; spec: SpecReport }[] = []
  const walk = (suite: Suite, titlePath: string[]) => {
    for (const spec of suite.specs ?? []) specs.push({ title: [...titlePath, spec.title].join(' › '), spec })
    for (const child of suite.suites ?? []) walk(child, [...titlePath, child.title])
  }
  for (const file of report.suites) walk(file, [file.file])
  return specs
}

export const testTitles = (report: Report) => specsOf(report).map(({ title }) => title)

/** Seconds each passing test took; a failure or timeout says nothing about its usual length. */
export function recordedDurations(report: Report): Durations {
  const durations: Durations = {}
  for (const { title, spec } of specsOf(report)) {
    const results = spec.tests?.flatMap((test) => test.results ?? []) ?? []
    if (results.length > 0 && results.every((result) => result.status === 'passed')) {
      durations[title] = Math.round(results.reduce((sum, result) => sum + result.duration, 0) / 100) / 10
    }
  }
  return durations
}

/** Each test's median across several runs' reports, so one slow runner does not set its weight. */
export function medianDurations(reports: readonly Report[]): Durations {
  const seconds = new Map<string, number[]>()
  for (const report of reports)
    for (const [title, duration] of Object.entries(recordedDurations(report))) seconds.set(title, [...(seconds.get(title) ?? []), duration])
  return Object.fromEntries(
    [...seconds].map(([title, values]) => {
      const sorted = values.toSorted((left, right) => left - right)
      const middle = Math.floor(sorted.length / 2)
      return [title, sorted.length % 2 ? sorted[middle]! : Math.round(((sorted[middle - 1]! + sorted[middle]!) / 2) * 10) / 10]
    }),
  )
}

/** Seconds of tests each runner takes on; its setup and stack startup cost about 90 more, so fuller runners waste less. */
export const runnerSeconds = 300
/** Playwright's workers per runner, from playwright.config.ts. */
const workers = 2

/** A desktop runner's share of the tests against a hosted one's: its setup downloads caches over a home line for about four minutes longer. */
const desktopShare = 0.4

/** Each runner's tests, and which runners the desktop takes: runners 2 onwards, up to `desktopSlots`, so runner 1 stays hosted. */
export function planShards(titles: readonly string[], durations: Durations, mostRunners: number, desktopSlots = 0) {
  if (!Number.isInteger(mostRunners) || mostRunners < 1) throw new Error(`runners must be a positive integer, got ${mostRunners}`)
  const known = titles.flatMap((title) => durations[title] ?? []).toSorted((left, right) => left - right)
  const median = known[Math.floor(known.length / 2)] ?? 1
  const longestFirst = titles
    .map((title, index) => ({ title, index, seconds: durations[title] ?? median }))
    .toSorted((left, right) => right.seconds - left.seconds || left.index - right.index)
  const total = longestFirst.reduce((sum, { seconds }) => sum + seconds, 0)
  const runners = Math.max(1, Math.min(mostRunners, titles.length, Math.ceil(total / (runnerSeconds * workers))))
  const desktop = Array.from({ length: Math.max(0, Math.min(desktopSlots, runners - 1)) }, (_, index) => index + 2)
  const capacity = Array.from({ length: runners }, (_, runner) => (desktop.includes(runner + 1) ? desktopShare : 1))
  const loads = Array.from({ length: runners }, () => 0)
  const runnerOf: number[] = []
  for (const { index, seconds } of longestFirst) {
    const finishes = loads.map((load, runner) => (load + seconds) / capacity[runner]!)
    const runner = finishes.indexOf(Math.min(...finishes))
    loads[runner]! += seconds
    runnerOf[index] = runner
  }
  return { shards: loads.map((_, runner) => titles.filter((_title, index) => runnerOf[index] === runner)), desktop }
}

const readJson = <T>(file: string): T => JSON.parse(fs.readFileSync(file, 'utf8')) as T

if (isEntryPoint(import.meta.url)) {
  const arguments_ = process.argv.slice(2)
  if (arguments_[0] === '--record') {
    const reports = arguments_.slice(1)
    if (reports.length === 0) throw new Error('usage: e2eShard.ts --record <report.json>...')
    const parsed = reports.map((report) => readJson<Report>(report))
    const listed = new Set(parsed.flatMap(testTitles))
    const kept = Object.entries(readJson<Durations>(durationsFile)).filter(([title]) => listed.has(title))
    const durations: Durations = { ...Object.fromEntries(kept), ...medianDurations(parsed) }
    const sorted = Object.fromEntries(Object.entries(durations).toSorted(([left], [right]) => left.localeCompare(right)))
    fs.writeFileSync(durationsFile, `${JSON.stringify(sorted, null, 2)}\n`)
  } else if (arguments_[0] === '--plan') {
    const [, listFile, directory, mostRunners, desktopSlots = '0'] = arguments_
    if (!listFile || !directory || !mostRunners)
      throw new Error('usage: e2eShard.ts --plan <tests.json> <dir> <most runners> [desktop slots]')
    const titles = testTitles(readJson(listFile))
    if (titles.length === 0) throw new Error(`${listFile} lists no tests`)
    const { shards, desktop } = planShards(titles, readJson(durationsFile), Number(mostRunners), Number(desktopSlots))
    fs.mkdirSync(directory, { recursive: true })
    shards.forEach((shard, index) => fs.writeFileSync(path.join(directory, `${index + 1}.txt`), `${shard.join('\n')}\n`))
    console.log(JSON.stringify({ count: shards.length, desktop }))
  } else {
    throw new Error('usage: e2eShard.ts --plan <tests.json> <dir> <most runners> [desktop slots] | --record <report.json>...')
  }
}
