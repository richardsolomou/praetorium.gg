import { useQueries, useQuery } from '@tanstack/react-query'
import type { RuleSummaries, RuleSummary } from '../contracts/rules'
import { TEXT_HOMES_MAX } from '../contracts/schemas'
import { hasTextTokens, textTokensIn } from '../core/sourceText'
import { summaryNamedBy, tokensAtHome } from '../shared/ruleSummaries'
import { ruleAbilitySummariesQuery, ruleSummariesQuery, textHomesQuery } from './queries/references'
import { textSources } from './functions'
import { referenceQuery } from './queries/shared'

/** A summary describes a whole rule, so it stands in only for tokens showing whole strings, not one bullet of a list. */
const WHOLE_STRING = new Set(['prose', 'plain', 'trim'])

type SummaryLookup = { summary: RuleSummary | null; pending: boolean }

const wholeTokens = (text: string) => {
  const tokens = hasTextTokens(text) ? textTokensIn(text) : []
  return tokens.length > 0 && tokens.every((token) => WHOLE_STRING.has(token.transform)) ? tokens : []
}
const unique = <T>(values: readonly T[]) => [...new Set(values)]

/**
 * The VS Data summaries of the rules these texts print, and whether any is still being asked. A token naming a file a
 * data update replaced, as an older battle's or saved reminder's does, reads the summary from the file its string
 * lives in now.
 */
export function useRuleSummaries(texts: readonly string[]) {
  const tokens = texts.flatMap(wholeTokens)
  const own = unique(tokens.map((token) => token.file))
  const ownAnswers = useQueries({ queries: own.map(ruleSummariesQuery) })
  const ofFile = new Map<string, RuleSummaries | undefined>(own.map((file, at) => [file, ownAnswers[at]?.data]))
  const hashes = unique(tokens.filter((token) => ofFile.get(token.file)?.replaced).map((token) => token.hash))
    .toSorted()
    .slice(0, TEXT_HOMES_MAX)
  const homes = useQuery({ ...textHomesQuery(hashes), enabled: hashes.length > 0 })
  const homeFiles = unique(tokensAtHome(tokens, ofFile, homes.data).map((token) => token.file)).filter((file) => !ofFile.has(file))
  const homeAnswers = useQueries({ queries: homeFiles.map(ruleSummariesQuery) })
  for (const [at, file] of homeFiles.entries()) ofFile.set(file, homeAnswers[at]?.data)
  const pending =
    ownAnswers.some((answer) => answer.isPending) ||
    (hashes.length > 0 && homes.isPending) ||
    homeAnswers.some((answer) => answer.isPending)
  return {
    pending,
    summaryOf: (text: string): RuleSummary | null => {
      const named = wholeTokens(text)
      return named.length ? summaryNamedBy(tokensAtHome(named, ofFile, homes.data), ofFile) : null
    },
  }
}

/** The VS Data summary of the rule a text prints, and whether that is still being asked. */
export function useRuleSummary(text: string): SummaryLookup {
  const { pending, summaryOf } = useRuleSummaries([text])
  return pending ? { summary: null, pending } : { summary: summaryOf(text), pending }
}

/** Whether the summaries of every rule these texts print have been asked for and answered, so a printout can wait for them. */
export const useRuleSummariesSettled = (texts: readonly string[]) => !useRuleSummaries(texts).pending

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

/** The summary of a weapon or core ability, by its `kind:id` or, for a keyword, by its name: undefined while it is asked for, null where VS Data has none. */
export function useAbilitySummary(ability: { key: string } | { name: string } | null): RuleSummary | null | undefined {
  const { data, isPending } = useQuery({ ...ruleAbilitySummariesQuery(), enabled: Boolean(ability) })
  if (!ability) return null
  if (!data) return isPending ? undefined : null
  if ('key' in ability) return data[ability.key] ?? null
  const slug = ability.name
    .normalize('NFKC')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '')
  return data[`weapon-ability:${slug}`] ?? data[`core-ability:${slug}`] ?? null
}
