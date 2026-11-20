import { hash } from 'node:crypto'
import { dataset } from '@alpaca-software/40kdc-data'
import { RecentlyUsed, remember } from '../core/collections'
import { comparableText, sourceStrings } from '../core/sourceText'
import { prose, stratagemText } from '../shared/datacards'
import { completeSteps } from '../shared/steps'
import { completeStepsCooperatively } from './canonicalCatalogue'
import { readCatalogueComposition } from './catalogueComposition'
import { sourceTexts, textFileId, textHash, textSourcePaths } from './sourceTexts'
import { readSharedJson } from './sharedJson'

type Summary = { digest: string; description: string }

export function ruleSummaryIndex(summaries: Iterable<Summary>) {
  const index = new Map<string, string | null>()
  for (const { digest, description } of summaries) {
    if (!index.has(digest)) index.set(digest, description)
    else if (index.get(digest) !== description) index.set(digest, null)
  }
  return index
}

function normalizedWording(wording: string) {
  // Match 40kdc's source_digest contract, including comparison operators and numeric modifiers.
  return prose(wording.replaceAll(/<\/(?:p|li)>|<br\s*\/?>/gi, ' ').replaceAll(/<[^>]+>/g, ''))
    .normalize('NFKC')
    .replaceAll(/\p{Cf}/gu, '')
    .toLowerCase()
    .normalize('NFKC')
    .replaceAll(/[‐‑‒–—―⁃−➖﹘﹣－]/g, '-')
    .replaceAll(/[×✕✖⨯]/g, 'x')
    .replaceAll(/[\p{P}\p{S}]/gu, (char) => ('+-=<>/%'.includes(char) ? ` ${char} ` : ' '))
    .replaceAll(/\s+/gu, ' ')
    .trim()
}

export function ruleSummaryIn(summaries: ReadonlyMap<string, string | null>, wording: string) {
  const normalized = normalizedWording(wording)
  const summary = summaries.get(hash('sha256', normalized))
  return summary && normalizedWording(summary) !== normalized ? summary : undefined
}

let packageSummaries: ReturnType<typeof ruleSummaryIndex> | undefined

function compiledSummaries() {
  return (packageSummaries ??= ruleSummaryIndex(
    dataset.forGameMode('all').abilities.all.flatMap((ability) => {
      const { raw } = ability
      const digest = raw.source_digest
      if (!digest || raw.stub || raw.game_version?.edition !== '11th' || !raw.effect) return []
      const description = ability.describe().trim()
      return description && !/^\[[\w-]+\]$/.test(description) ? [{ digest, description }] : []
    }),
  ))
}

function summariesForFile(file: string, index: ReadonlyMap<string, string | null>): Record<string, string> {
  const data = readSharedJson(file) as { stratagems?: Record<string, unknown>[] }
  const matches: Record<string, string> = {}
  for (const raw of sourceStrings(data)) {
    const description = ruleSummaryIn(index, raw)
    if (description) matches[textHash(raw)] = description
  }
  const format = sourceTexts('')
  for (const stratagem of data.stratagems ?? []) {
    const clauses: string[] = []
    const key = stratagemText(stratagem, (raw, transform) => {
      clauses.push(raw)
      return format(raw, transform)
    })
    // 40kdc fingerprints the four printed sections as one rule, in order and without the labels.
    const description = ruleSummaryIn(index, clauses.join('\n'))
    if (key && description) matches[comparableText(key)] = description
  }
  return matches
}

function wordingVariants(text: string) {
  return [text, ...text.split('\n').filter((line) => line.length >= 60)].map((piece) =>
    normalizedWording(piece.replaceAll(/<[^>]+>/g, ' ').replaceAll(/[*_`#>^■]/g, '')),
  )
}

function* allowedSummarySteps(generated: ReadonlyMap<string, string | null>, originals: Iterable<Iterable<string>>) {
  const byDescription = new Map<string, string[]>()
  for (const [digest, description] of generated)
    if (description) for (const wording of wordingVariants(description)) remember(byDescription, wording, () => []).push(digest)
  const allowed = new Map(generated)
  let inspected = 0
  for (const file of originals) {
    for (const raw of file) {
      for (const wording of wordingVariants(raw)) for (const digest of byDescription.get(wording) ?? []) allowed.delete(digest)
      if (++inspected % 256 === 0) yield
    }
    yield
  }
  return allowed
}

export function withoutOriginalWording(generated: ReadonlyMap<string, string | null>, originals: Iterable<string>) {
  return completeSteps(allowedSummarySteps(generated, [originals]))
}

function* snapshotWording(files: Iterable<string>) {
  const seen = new WeakSet<object>()
  for (const file of files) {
    const parsed = readSharedJson(file)
    if (!parsed || typeof parsed !== 'object' || seen.has(parsed)) continue
    seen.add(parsed)
    yield sourceStrings(parsed)
  }
}

export function summaryFiles(directory: string) {
  return new Map(textSourcePaths(directory, readCatalogueComposition(directory)).map(({ path, url }) => [textFileId(url), path]))
}

export function ruleSummaryReader(directory: string) {
  const files = summaryFiles(directory)
  let prepared: Promise<ReturnType<typeof withoutOriginalWording>> | undefined
  const held = new RecentlyUsed<string, Record<string, string>>(32)
  return async (id: string) => {
    const file = files.get(id)
    if (!file) return {}
    const index = await (prepared ??= completeStepsCooperatively(
      allowedSummarySteps(compiledSummaries(), snapshotWording(files.values())),
    ).catch((error: unknown) => {
      prepared = undefined
      throw error
    }))
    return remember(held, id, () => summariesForFile(file, index))
  }
}
