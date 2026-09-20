import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { CanonicalCatalogue, CanonicalCatalogueIssue } from '../src/contracts/catalogue'

const encoded = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`

export type CatalogueCompilerReference = { repository: string; commit: string }

function assertSafeDirectory(directory: string) {
  const resolved = path.resolve(directory)
  if (
    path.basename(resolved) !== 'generated' ||
    resolved === path.parse(resolved).root ||
    resolved === path.resolve(os.homedir()) ||
    fs.existsSync(path.join(resolved, '.git'))
  ) {
    throw new Error(`refusing to replace unsafe catalogue ledger directory ${resolved}`)
  }
}

function stableId(value: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) || value === '.' || value === '..') {
    throw new Error(`catalogue ledger identifier is not path-safe: ${JSON.stringify(value)}`)
  }
  return value
}

function compilerReference(value: CatalogueCompilerReference | undefined) {
  if (!value) return null
  if (!value.repository.match(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)) {
    throw new Error('catalogue compiler repository must name a GitHub repository')
  }
  if (!value.commit.match(/^[0-9a-f]{40}$/)) throw new Error('catalogue compiler commit must be a full Git commit SHA')
  return value
}

function writeJson(directory: string, name: string, value: unknown) {
  const file = path.join(directory, name)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, encoded(value))
}

function issueCounts(issues: readonly CanonicalCatalogueIssue[]) {
  const counts = new Map<CanonicalCatalogueIssue['kind'], number>()
  for (const issue of issues) counts.set(issue.kind, (counts.get(issue.kind) ?? 0) + 1)
  return Object.fromEntries([...counts].toSorted(([left], [right]) => left.localeCompare(right)))
}

function writeLedger(catalogue: CanonicalCatalogue, directory: string, compiler: CatalogueCompilerReference | undefined) {
  const factions = new Map<string, { name: string; count: number }>()
  const records = new Set<string>()
  for (const datasheet of catalogue.datasheets) {
    const catalogueId = stableId(datasheet.catalogueId)
    const datasheetId = stableId(datasheet.id)
    const record = `${catalogueId}\0${datasheetId}`
    if (records.has(record)) throw new Error(`canonical catalogue repeats datasheet ${datasheet.catalogueId}:${datasheet.id}`)
    records.add(record)
    const faction = factions.get(catalogueId)
    if (faction && faction.name !== datasheet.faction) {
      throw new Error(`canonical catalogue gives ${datasheet.catalogueId} more than one faction name`)
    }
    factions.set(catalogueId, { name: datasheet.faction, count: (faction?.count ?? 0) + 1 })
    writeJson(directory, path.join('factions', catalogueId, 'datasheets', `${datasheetId}.json`), datasheet)
  }
  for (const [catalogueId, faction] of [...factions].toSorted(([left], [right]) => left.localeCompare(right))) {
    writeJson(directory, path.join('factions', catalogueId, 'faction.json'), {
      catalogueId,
      name: faction.name,
      datasheets: faction.count,
    })
  }
  const ruleIds = new Set<string>()
  for (const document of catalogue.ruleDocuments) {
    const id = stableId(document.id)
    if (ruleIds.has(id)) throw new Error(`canonical catalogue repeats rule document ${document.id}`)
    ruleIds.add(id)
    writeJson(directory, path.join('rules', `${id}.json`), document)
  }
  const summary = {
    datasheets: catalogue.datasheets.length,
    factions: factions.size,
    ruleDocuments: catalogue.ruleDocuments.length,
    issues: catalogue.issues.length,
    warnings: catalogue.issues.filter((issue) => issue.severity === 'warning').length,
    notices: catalogue.issues.filter((issue) => issue.severity === 'notice').length,
    issueKinds: issueCounts(catalogue.issues),
  }
  writeJson(directory, 'manifest.json', {
    format: catalogue.format,
    compilerVersion: catalogue.compilerVersion,
    ...(compilerReference(compiler) ? { compiler } : {}),
    revisions: catalogue.revisions,
    counts: {
      datasheets: summary.datasheets,
      factions: summary.factions,
      ruleDocuments: summary.ruleDocuments,
      issues: summary.issues,
    },
  })
  writeJson(directory, path.join('audit', 'summary.json'), summary)
  writeJson(directory, path.join('audit', 'issues.json'), catalogue.issues)
  return summary
}

export function writeCatalogueLedger(catalogue: CanonicalCatalogue, directory: string, compiler?: CatalogueCompilerReference) {
  assertSafeDirectory(directory)
  const resolved = path.resolve(directory)
  const staging = `${resolved}.incoming-${process.pid}-${randomUUID()}`
  fs.mkdirSync(path.dirname(resolved), { recursive: true })
  try {
    const summary = writeLedger(catalogue, staging, compiler)
    fs.rmSync(resolved, { recursive: true, force: true })
    fs.renameSync(staging, resolved)
    return summary
  } finally {
    fs.rmSync(staging, { recursive: true, force: true })
  }
}
