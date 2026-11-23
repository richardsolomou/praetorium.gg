import fs from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { vsDataSummariesSteps, type VsDataSummaries } from '../src/server/vsDataSummaries'
import { summaryNamedBy, wholeRuleOf, wholeRuleTokens } from '../src/shared/ruleSummaries'
import type { LoadedRules } from '../src/shared/rules'
import { completeSteps } from '../src/shared/steps'
import { loadSnapshotWithRules } from './lib/catalogueSnapshotLoad'

const directory = process.env.CATALOGUE_DIR ?? 'catalogue-data'

/** A card's When Drawn condition is a clause of its rule's words, which the draw prompt states through the rule's summary. */
describe.skipIf(!fs.existsSync(directory))('a secondary that can be swapped when drawn', () => {
  let rules: LoadedRules
  let summaries: VsDataSummaries

  beforeAll(() => {
    rules = loadSnapshotWithRules(directory).rules
    summaries = completeSteps(vsDataSummariesSteps(directory, rules.ruleDocuments))!
  }, 180_000)

  it('states every condition the cards publish through its rule’s summary', () => {
    const summarized = rules.secondaries.flatMap((card) => {
      const condition = card.whenDrawn?.condition
      if (!condition) return []
      const tokens = wholeRuleTokens(wholeRuleOf(condition))
      return [
        { card: card.name, found: summaryNamedBy(tokens, new Map(tokens.map((token) => [token.file, summaries.summariesIn(token.file)]))) },
      ]
    })
    expect({ cards: summarized.length > 0, unstated: summarized.flatMap(({ card, found }) => (found ? [] : [card])) }).toEqual({
      cards: true,
      unstated: [],
    })
  })
})
