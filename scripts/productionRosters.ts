import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { catalogueEditionLoaders } from '../src/server/catalogueEditions'
import { SpacetimeOperator } from '../src/server/spacetimeOperator'
import { PREVIEW_EMAIL, previewAccountId } from './seedPreview'
import { runningLocalDevPreview } from './localDevPreview'
import { fetchProductionRostersOverSsh, type RosterWriteOutcome, writeNormalisedRostersOverSsh } from './lib/productionRosterSsh'
import {
  auditProductionRosters,
  compareRosterAudits,
  fetchProductionRosters,
  importProductionRosters,
  MAX_ROSTER_SNAPSHOT_BYTES,
  normaliseProductionRosters,
  productionRosterSnapshotSchema,
  rosterAuditBaselineSchema,
} from './lib/productionRosters'
import { isEntryPoint } from './lib/entryPoint.ts'
import { loadSnapshot } from './lib/catalogueSnapshotLoad'
import { requiredEnv } from './lib/requiredEnv'
import { replaceFile } from '../src/server/replaceFile'

const defaultSnapshot = 'data-dev/production-rosters.json'

async function writePrivateJson(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true })
  await replaceFile(file, (temporary) => writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 }))
}

async function readSnapshot(file: string) {
  if ((await stat(file)).size > MAX_ROSTER_SNAPSHOT_BYTES) throw new Error('Roster snapshot exceeds 64 MiB')
  return productionRosterSnapshotSchema.parse(JSON.parse(await readFile(file, 'utf8')))
}

function loadEditions(directory: string) {
  const { catalogue: base, rules } = loadSnapshot(directory)
  return catalogueEditionLoaders(
    directory,
    () => base,
    () => rules,
  )
}

export async function productionRostersMain(args: string[]) {
  const apply = args[0] === 'normalise' && args.at(-1) === '--apply'
  const [command, snapshotFile = defaultSnapshot, catalogueDir, baselineFile] = apply ? args.slice(0, -1) : args
  const maximum = command === 'audit' ? 4 : command === 'normalise' ? 2 + Number(apply) : 2
  if (!['fetch', 'import', 'audit', 'normalise'].includes(command ?? '') || args.length > maximum) {
    throw new Error(
      'Usage: productionRosters.ts fetch|import [snapshot.json] | audit [snapshot.json] [catalogue-directory] [baseline-report.json] | normalise [snapshot.json] [--apply]',
    )
  }
  if (command === 'fetch') {
    const snapshot = process.env.PRODUCTION_SSH_HOST
      ? await fetchProductionRostersOverSsh(requiredEnv('PRODUCTION_SSH_HOST'), requiredEnv('PRODUCTION_WEB_SERVICE'))
      : await fetchProductionRosters({
          url: requiredEnv('PRODUCTION_SPACETIME_URL'),
          database: requiredEnv('PRODUCTION_SPACETIME_DATABASE'),
          ownerToken: requiredEnv('PRODUCTION_SPACETIME_OWNER_TOKEN'),
          accessClientId: process.env.PRODUCTION_SPACETIME_ACCESS_CLIENT_ID,
          accessClientSecret: process.env.PRODUCTION_SPACETIME_ACCESS_CLIENT_SECRET,
        })
    await writePrivateJson(snapshotFile, snapshot)
    console.log(`Fetched ${snapshot.rosters.length} production rosters to ${snapshotFile}`)
    return
  }
  const snapshot = await readSnapshot(snapshotFile)
  const worktree = await realpath(process.cwd())
  const preview = await runningLocalDevPreview(worktree)
  if (command === 'import') {
    if (!preview?.ready) throw new Error('Start this worktree with just dev before importing rosters')
    const credentials = z
      .object({ operator: z.object({ token: z.string() }) })
      .parse(JSON.parse(await readFile(path.join(preview.dataDir, 'credentials.json'), 'utf8')))
    const operator = new SpacetimeOperator(`http://127.0.0.1:${preview.spacetimePort}`, preview.database, credentials.operator.token)
    const imported = await importProductionRosters(snapshot, previewAccountId(preview.database, PREVIEW_EMAIL), operator)
    const ids = new Set(snapshot.rosters.map((roster) => roster.id))
    const orphaned = snapshot.rosters.filter((roster) => roster.baseRosterId && !ids.has(roster.baseRosterId)).length
    if (orphaned) console.log(`${orphaned} variants whose production base was deleted are imported as standalone rosters`)
    console.log(
      `Imported ${imported} rosters (${snapshot.rosters.length - imported} local copies preserved). Sign in as ${PREVIEW_EMAIL} at ${preview.publicUrl}`,
    )
    return
  }
  const directory = path.resolve(catalogueDir ?? preview?.catalogueDir ?? process.env.CATALOGUE_DIR ?? 'catalogue-data')
  const editions = loadEditions(directory)
  if (command === 'normalise') return normalise(snapshot, snapshotFile, directory, editions, apply)
  const results = auditProductionRosters(snapshot, editions.catalogueFor, editions.rulesFor)
  if (baselineFile && (await stat(baselineFile)).size > MAX_ROSTER_SNAPSHOT_BYTES) throw new Error('Baseline report exceeds 64 MiB')
  const baseline = baselineFile ? rosterAuditBaselineSchema.parse(JSON.parse(await readFile(baselineFile, 'utf8'))) : undefined
  if (baseline && (baseline.fetchedAt !== snapshot.fetchedAt || JSON.stringify(baseline.source) !== JSON.stringify(snapshot.source)))
    throw new Error('Baseline must use the same production snapshot')
  const comparisons = compareRosterAudits(results, baseline?.results)
  const report = results.map((result, index) => ({ ...result, ...comparisons[index] }))
  const file = `${snapshotFile.replace(/\.json$/, '')}.audit.json`
  await writePrivateJson(file, { fetchedAt: snapshot.fetchedAt, source: snapshot.source, results: report })
  const affected = results.filter(
    (result) => !result.available || result.unavailable.length || result.unavailableDetachments.length || result.modelCountChanges.length,
  ).length
  const regressions = comparisons.filter((result) => result.regressed).length
  const illegal = results.filter(
    (result) => (result.points !== null && result.points > result.limit) || result.errors.length || result.detachmentError,
  ).length
  console.log(
    `${results.length} rosters checked; ${affected} have unavailable data; ${illegal} have points or legality problems; ${results.filter((result) => result.migrated).length} migrated. Report: ${file}`,
  )
  if (baseline) console.log(`${regressions} rosters regressed against the baseline report`)
  if (regressions) process.exitCode = 1
}

async function normalise(
  snapshot: z.infer<typeof productionRosterSnapshotSchema>,
  snapshotFile: string,
  directory: string,
  editions: ReturnType<typeof loadEditions>,
  apply: boolean,
) {
  const results = normaliseProductionRosters(snapshot, editions.catalogueFor, editions.rulesFor)
  for (const result of results) {
    if (result.status === 'skipped') console.log(`${result.id}: skipped, ${result.reason}`)
    for (const unit of result.units)
      for (const change of unit.changes) console.log(`${result.id}: ${unit.name} (#${unit.pickIndex}) ${change.summary}`)
  }
  const changed = results.filter((result) => result.status === 'changed')
  const file = `${snapshotFile.replace(/\.json$/, '')}.normalise.json`
  const report = { fetchedAt: snapshot.fetchedAt, source: snapshot.source, applied: apply, results, writes: [] as RosterWriteOutcome[] }
  await writePrivateJson(file, report)
  console.log(
    `${results.length} rosters checked; ${changed.length} would change, all identical when rebuilt; ${results.filter((result) => result.status === 'skipped').length} skipped. Report: ${file}`,
  )
  if (!apply) return
  const stored = new Map(snapshot.rosters.map((roster) => [roster.id, roster]))
  const writes = changed.map((result) => {
    const { catalogueId, detachmentIds, borrowedDetachmentId, picks } = stored.get(result.id)!
    return {
      id: result.id,
      updatedAt: result.updatedAt,
      expected: { catalogueId, detachmentIds, borrowedDetachmentId, picks },
      write: result.write,
    }
  })
  const revision = z.record(z.string(), z.string()).parse(JSON.parse(await readFile(path.join(directory, 'revision.json'), 'utf8')))
  try {
    await writeNormalisedRostersOverSsh(
      requiredEnv('PRODUCTION_SSH_HOST'),
      requiredEnv('PRODUCTION_WEB_SERVICE'),
      revision,
      writes,
      (outcome) => {
        report.writes.push(outcome)
        console.log(`${outcome.id}: ${outcome.outcome}${outcome.reason ? `, ${outcome.reason}` : ''}`)
      },
    )
  } finally {
    await writePrivateJson(file, report)
  }
  const written = report.writes.filter((outcome) => outcome.outcome === 'written').length
  console.log(`${written} of ${writes.length} rosters written. Report: ${file}`)
}

if (isEntryPoint(import.meta.url)) await productionRostersMain(process.argv.slice(2))
