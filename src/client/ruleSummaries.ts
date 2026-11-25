import { useQueries, useQuery } from '@tanstack/react-query'
import { MISSION_SUMMARIES, RULE_SUMMARIES, type RuleSummaries, type RuleSummary } from '../contracts/rules'
import { TEXT_HOMES_MAX } from '../contracts/schemas'
import { abilityKeysNamed, summaryNamedBy, tokensAtHome, wholeRuleTokens } from '../shared/ruleSummaries'
import { ruleAbilitySummariesQuery, ruleCoreSummaryQuery, ruleSummariesQuery, textHomesQuery } from './queries/references'

type SummaryLookup = { summary: RuleSummary | null; pending: boolean }

const unique = <T>(values: readonly T[]) => [...new Set(values)]

/**
 * The VS Data summaries of the rules these texts print, and whether any is still being asked. A token naming a file a
 * data update replaced, as an older battle's or saved reminder's does, reads the summary from the file its string
 * lives in now.
 */
export function useRuleSummaries(texts: readonly string[]) {
  const tokens = texts.flatMap(wholeRuleTokens)
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
  /** `name` is the ability printing `text`, whose own name settles which of several abilities printing it alike it is. */
  const recordOf = (text: string, name?: string) => {
    const named = wholeRuleTokens(text)
    return named.length ? summaryNamedBy(tokensAtHome(named, ofFile, homes.data), ofFile, name) : null
  }
  return { pending, recordOf, summaryOf: (text: string): RuleSummary | null => recordOf(text)?.summary ?? null }
}

/** The VS Data summary of the rule a text prints, and whether that is still being asked. */
export function useRuleSummary(text: string): SummaryLookup {
  const { pending, summaryOf } = useRuleSummaries([text])
  return pending ? { summary: null, pending } : { summary: summaryOf(text), pending }
}

type MissionKind = 'mission-card' | 'mission-award' | 'mission-action' | 'mission-twist'

/** The VS Data summary of a mission card, award, action or twist, by its kind and ID, and whether it is still loading. */
export function useMissionSummary(kind: MissionKind, id: string | undefined) {
  const { data, isPending } = useQuery({ ...ruleSummariesQuery(MISSION_SUMMARIES), enabled: Boolean(id) })
  if (!id) return { summary: null, pending: false }
  return { summary: data?.records[`${kind}:${id}`] ?? null, pending: isPending }
}

/** Whether the summaries of every rule these texts print have been asked for and answered, so a printout can wait for them. */
export const useRuleSummariesSettled = (texts: readonly string[]) => !useRuleSummaries(texts).pending

/**
 * The summaries of the rules documents' rules and clarifications, by VS Data id, and whether they have been answered, as
 * they lengthen the page they arrive on.
 */
export function useRuleEntrySummaries() {
  const { data, isFetched } = useQuery(ruleSummariesQuery(RULE_SUMMARIES))
  return { settled: isFetched, summaryOf: (rule: string): RuleSummary | undefined => data?.records[`core-rule:${rule}`] }
}

/**
 * The summary of the weapon or core ability a keyword names, by its name: undefined while asked for, null where VS Data
 * has no such ability.
 */
export function useKeywordSummary(name: string): RuleSummary | null | undefined {
  const { data, isPending } = useQuery(ruleAbilitySummariesQuery())
  if (!data) return isPending ? undefined : null
  const keys = abilityKeysNamed(name).filter((key) => !key.startsWith('core-rule:'))
  return keys.map((key) => data[key]).find(Boolean) ?? null
}

/**
 * The summary of a weapon or core ability, by its `kind:id` or, for a keyword, by its name, and failing that of the whole
 * core rule of that name, as a granted Benefit of Cover is: undefined while it is asked for, null where VS Data has none.
 */
export function useAbilitySummary(ability: { key: string } | { name: string } | null): RuleSummary | null | undefined {
  const { data, isPending } = useQuery({ ...ruleAbilitySummariesQuery(), enabled: Boolean(ability) })
  const keys = ability && 'name' in ability ? abilityKeysNamed(ability.name) : []
  const named = data && keys.map((key) => data[key]).find(Boolean)
  // Only asked once no ability summary answers, as most names are abilities and the core rules are many.
  const coreRules = useQueries({
    queries: (data && !named ? keys.filter((key) => key.startsWith('core-rule:')) : []).map(ruleCoreSummaryQuery),
  })
  if (!ability) return null
  if (!data) return isPending ? undefined : null
  if ('key' in ability) return data[ability.key] ?? null
  if (named) return named
  if (coreRules.some((answer) => answer.isPending)) return undefined
  return coreRules.map((answer) => answer.data).find(Boolean) ?? null
}
