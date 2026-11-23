import { useQueries, useQuery } from '@tanstack/react-query'
import type { RuleSummary } from '../contracts/rules'
import { hasTextTokens, textTokensIn } from '../core/sourceText'
import { summaryNamedBy } from '../shared/ruleSummaries'
import { ruleAbilitySummariesQuery, ruleSummariesQuery } from './queries/references'
import { textSources } from './functions'
import { referenceQuery } from './queries/shared'

/** A summary describes a whole rule, so it stands in only for tokens showing whole strings, not one bullet of a list. */
const WHOLE_STRING = new Set(['prose', 'plain', 'trim'])

type SummaryLookup = { summary: RuleSummary | null; pending: boolean }

/**
 * The VS Data summary of the rule a text prints, and whether that is still being asked.
 */
export function useRuleSummary(text: string): SummaryLookup {
  const tokens = hasTextTokens(text) ? textTokensIn(text) : []
  const whole = tokens.length > 0 && tokens.every((token) => WHOLE_STRING.has(token.transform))
  const files = whole ? [...new Set(tokens.map((token) => token.file))] : []
  const answers = useQueries({ queries: files.map(ruleSummariesQuery) })
  if (!whole) return { summary: null, pending: false }
  if (answers.some((answer) => answer.isPending)) return { summary: null, pending: true }
  return { summary: summaryNamedBy(tokens, new Map(files.map((file, at) => [file, answers[at]?.data]))), pending: false }
}

/** Whether the summaries of every rule these texts print have been asked for and answered, so a printout can wait for them. */
export function useRuleSummariesSettled(texts: readonly string[]) {
  const files = [...new Set(texts.flatMap((text) => (hasTextTokens(text) ? textTokensIn(text).map((token) => token.file) : [])))]
  return useQueries({ queries: files.map(ruleSummariesQuery) }).every((answer) => !answer.isPending)
}

/** Where each source file a token names lives upstream, which names the file a rules document is printed in. */
const textSourcesQuery = () => referenceQuery(['text-sources'], () => textSources())

/**
 * The summaries of a rules document's entries, by entry id, once the file it is printed in is known, and whether they
 * have been asked for and answered, as they lengthen the page they arrive on.
 */
export function useRuleEntrySummaries(url: string | null) {
  const { data: table, isFetched: located } = useQuery({ ...textSourcesQuery(), enabled: Boolean(url) })
  const file = table && Object.entries(table).find(([, entry]) => entry.url === url)?.[0]
  const { data, isFetched } = useQuery({ ...ruleSummariesQuery(file ?? ''), enabled: Boolean(file) })
  return {
    settled: !url || (located && (!file || isFetched)),
    summaryOf: (entry: string): RuleSummary | undefined => {
      const id = data?.entries[entry]
      return id ? data.records[id] : undefined
    },
  }
}

/** The summary of a weapon or core ability, by its `kind:id` or, for a keyword, by its name; null until it is known. */
export function useAbilitySummary(ability: { key: string } | { name: string } | null): RuleSummary | null {
  const { data } = useQuery({ ...ruleAbilitySummariesQuery(), enabled: Boolean(ability) })
  if (!ability || !data) return null
  if ('key' in ability) return data[ability.key] ?? null
  const slug = ability.name
    .normalize('NFKC')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '')
  return data[`weapon-ability:${slug}`] ?? data[`core-ability:${slug}`] ?? null
}
