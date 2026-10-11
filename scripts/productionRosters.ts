import { mkdir, open, readFile, realpath, rename, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { loadCatalogue } from '../src/server/catalogueIndex'
import { catalogueEditionLoaders } from '../src/server/catalogueEditions'
import { loadRules } from '../src/server/rules'
import { SpacetimeOperator } from '../src/server/spacetimeOperator'
import { PREVIEW_EMAIL, previewAccountId } from './seedPreview'
import { inspectLocalDevPreview, localControlPort, readLocalDevPreview } from './localDevPreview'
import { fetchProductionRostersOverSsh } from './lib/productionRosterSsh'
import {
  auditProductionRosters,
  compareRosterAudits,
  fetchProductionRosters,
  importProductionRosters,
  MAX_ROSTER_SNAPSHOT_BYTES,
  productionRosterSnapshotSchema,
  rosterAuditBaselineSchema,
} from './lib/productionRosters'

const defaultSnapshot = 'data-dev/production-rosters.json'

async function writePrivateJson(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.tmp`
  try {
    const handle = await open(temporary, 'wx', 0o600)
    try {
      await handle.writeFile(JSON.stringify(value, null, 2) + '\n')
    } finally {
      await handle.close()
    }
    await rename(temporary, file)
  } finally {
    await rm(temporary, { force: true })
  }
}

async function readSnapshot(file: string) {
  if ((await stat(file)).size > MAX_ROSTER_SNAPSHOT_BYTES) throw new Error('Roster snapshot exceeds 64 MiB')
  return productionRosterSnapshotSchema.parse(JSON.parse(await readFile(file, 'utf8')))
}

export async function productionRostersMain(args: string[]) {
  const [command, snapshotFile = defaultSnapshot, catalogueDir, baselineFile] = args
  if (!['fetch', 'import', 'audit'].includes(command ?? '') || args.length > (command === 'audit' ? 4 : 2)) {
    throw new Error(
      'Usage: productionRosters.ts fetch|import [snapshot.json] | audit [snapshot.json] [catalogue-directory] [baseline-report.json]',
    )
  }
  if (command === 'fetch') {
    const required = (name: string) => {
      const value = process.env[name]
      if (!value) throw new Error(`Missing ${name}`)
      return value
    }
    const snapshot = process.env.PRODUCTION_SSH_HOST
      ? await fetchProductionRostersOverSsh(required('PRODUCTION_SSH_HOST'), required('PRODUCTION_WEB_SERVICE'))
      : await fetchProductionRosters({
          url: required('PRODUCTION_SPACETIME_URL'),
          database: required('PRODUCTION_SPACETIME_DATABASE'),
          ownerToken: required('PRODUCTION_SPACETIME_OWNER_TOKEN'),
          accessClientId: process.env.PRODUCTION_SPACETIME_ACCESS_CLIENT_ID,
          accessClientSecret: process.env.PRODUCTION_SPACETIME_ACCESS_CLIENT_SECRET,
        })
    await writePrivateJson(snapshotFile, snapshot)
    console.log(`Fetched ${snapshot.rosters.length} production rosters to ${snapshotFile}`)
    return
  }
  const snapshot = await readSnapshot(snapshotFile)
  const worktree = await realpath(process.cwd())
  const saved = readLocalDevPreview(path.join(worktree, 'data-dev/active-preview.json'))
  const preview = await inspectLocalDevPreview(worktree, saved?.controlPort ?? localControlPort(worktree), saved?.token)
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
  const audit = (directory: string) => {
    const base = loadCatalogue(directory)
    if (!base) throw new Error(`Catalogue unavailable: ${directory}`)
    const rules = loadRules(directory, undefined, undefined, undefined, base.datacards)
    const editions = catalogueEditionLoaders(
      directory,
      () => base,
      () => rules,
    )
    return auditProductionRosters(snapshot, editions.catalogueFor, editions.rulesFor)
  }
  const results = audit(path.resolve(catalogueDir ?? preview?.catalogueDir ?? process.env.CATALOGUE_DIR ?? 'catalogue-data'))
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

if (process.argv[1] && fileURLToPath(import.meta.url) === (await realpath(process.argv[1])))
  await productionRostersMain(process.argv.slice(2))
