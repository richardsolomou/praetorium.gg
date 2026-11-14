/**
 * Replaces browser-test screenshot baselines with the images a CI run took.
 *
 * Font rendering differs between machines, so a baseline taken locally fails on the runner.
 * `tsx scripts/e2eScreenshots.ts <run id>` downloads the run's JSON reports and failed results,
 * and for each screenshot comparison whose final attempt failed, copies the image the runner took
 * to the baseline path the comparison expected.
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { specsOf, type Report } from './e2eShard.ts'

const run = process.argv[2]
if (!run) throw new Error('usage: tsx scripts/e2eScreenshots.ts <run id>')
const downloads = mkdtempSync(path.join(os.tmpdir(), `praetorium-e2e-screenshots-${run}-`))
execFileSync('gh', ['run', 'download', run, '--pattern', 'e2e-report-*', '--pattern', 'playwright-results-*', '--dir', downloads], {
  stdio: 'inherit',
})

const files = readdirSync(downloads, { recursive: true, encoding: 'utf8' }).map((file) => path.join(downloads, file))
/** A runner's output path, found in the downloads by its test's output directory and file name. */
const downloaded = (runnerPath: string) => {
  const suffix = path.join(path.basename(path.dirname(runnerPath)), path.basename(runnerPath))
  return files.find((file) => file.endsWith(path.sep + suffix))
}

let copied = 0
for (const reportFile of files.filter((file) => /e2e-report-\d+\.json$/.test(file))) {
  const report = JSON.parse(readFileSync(reportFile, 'utf8')) as Report & { config: { configFile: string } }
  const root = path.dirname(report.config.configFile)
  for (const { spec } of specsOf(report))
    for (const test of spec.tests ?? []) {
      const attachments = test.results?.at(-1)?.attachments ?? []
      for (const actual of attachments.filter(({ name }) => name.endsWith('-actual.png'))) {
        const expected = attachments.find(({ name }) => name === actual.name.replace(/-actual\.png$/, '-expected.png'))
        const image = actual.path && downloaded(actual.path)
        if (!expected?.path || !image) throw new Error(`run ${run} has no image or baseline path for ${actual.name}`)
        const baseline = path.relative(root, expected.path)
        mkdirSync(path.dirname(baseline), { recursive: true })
        copyFileSync(image, baseline)
        console.log(`updated ${baseline}`)
        copied += 1
      }
    }
}
if (copied === 0) console.log(`run ${run} has no failed screenshot comparisons`)
