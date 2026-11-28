import fs from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import type { RuleSummaries } from '../src/contracts/rules'
import type { TextToken } from '../src/core/sourceText'
import { readCatalogueComposition } from '../src/server/catalogueComposition'
import { textFileId, textHomesSteps, textSourceFiles } from '../src/server/sourceTexts'
import { summariesOfFile, type VsDataSummaries, vsDataSummariesSteps } from '../src/server/vsDataSummaries'
import { recordsPrinting, tokensAtHome } from '../src/shared/ruleSummaries'
import { completeSteps } from '../src/shared/steps'
import { sharedSnapshot } from './lib/catalogueSnapshotLoad'

const directory = process.env.CATALOGUE_DIR ?? 'catalogue-data'

/**
 * A token names its file by the upstream address, revision included, so every data update replaces the file a battle
 * or saved reminder kept a token of; its rule must still show the summary it showed before.
 */
describe.skipIf(!fs.existsSync(directory))('a rule kept from before a data update', () => {
  let files: ReturnType<typeof textSourceFiles>
  let summaries: VsDataSummaries
  let homeOf: (hash: string) => string | null

  beforeAll(() => {
    const composition = readCatalogueComposition(directory)
    files = textSourceFiles(directory, composition)
    summaries = completeSteps(vsDataSummariesSteps(directory, sharedSnapshot(directory).rules.ruleDocuments))!
    homeOf = completeSteps(textHomesSteps(directory, composition))
  }, 180_000)

  /** A current card file's rule with a summary, by the hash of a string only that file holds. */
  const summarizedRule = () => {
    for (const [file, { url, source }] of Object.entries(files)) {
      if (source !== 'game-datacards') continue
      const { texts, records } = summaries.summariesIn(file)
      const hash = Object.keys(texts).find((candidate) => homeOf(candidate) === file && texts[candidate]!.length === 1)
      if (hash) return { file, url, hash, summary: records[texts[hash]![0]!]! }
    }
    throw new Error('No card file has a summary.')
  }

  const read = (tokens: readonly TextToken[], homes: Record<string, string | null> | undefined) => {
    const ofFile = new Map<string, RuleSummaries>(tokens.map((token) => [token.file, summariesOfFile(token.file, files, summaries)]))
    const moved = tokensAtHome(tokens, ofFile, homes)
    for (const token of moved) ofFile.set(token.file, summariesOfFile(token.file, files, summaries))
    return recordsPrinting(moved, ofFile)[0] ?? null
  }

  it('shows the summary of the file its string lives in now', () => {
    const { url, hash, summary } = summarizedRule()
    const older = { file: textFileId(url.replace(/[0-9a-f]{40}/, '0'.repeat(40))), transform: 'plain' as const, hash }
    expect(read([older], { [hash]: homeOf(hash) })?.summary).toEqual(summary)
  })
})
