import { useQueries, useQuery } from '@tanstack/react-query'
import type { RuleSummaries, RuleSummary } from '../contracts/rules'
import { hasTextTokens, type TextToken, textTokensIn } from '../core/sourceText'
import { ruleSummariesQuery } from './queries/references'
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

/**
 * The summary of a rule printing every token's string. A line several rules share, such as a stratagem's timing,
 * narrows the rule down only together with the others; rules left alike print the same words, such as one stratagem
 * several detachments offer, so the first one's summary describes them all.
 */
export function summaryNamedBy(tokens: readonly TextToken[], ofFile: ReadonlyMap<string, RuleSummaries | undefined>) {
  const [first = [], ...rest] = tokens.map((token) => ofFile.get(token.file)?.texts[token.hash] ?? [])
  const [id] = rest.reduce((shared, holders) => shared.filter((held) => holders.includes(held)), first)
  return (id && tokens.map((token) => ofFile.get(token.file)?.records[id]).find(Boolean)) || null
}

/** Whether the summaries of every rule these texts print have been asked for and answered, so a printout can wait for them. */
export function useRuleSummariesSettled(texts: readonly string[]) {
  const files = [...new Set(texts.flatMap((text) => (hasTextTokens(text) ? textTokensIn(text).map((token) => token.file) : [])))]
  return useQueries({ queries: files.map(ruleSummariesQuery) }).every((answer) => !answer.isPending)
}

/** Where each source file a token names lives upstream, which names the file a rules document is printed in. */
const textSourcesQuery = () => referenceQuery(['text-sources'], () => textSources())

/** The summaries of a rules document's entries, by entry id, once the file it is printed in is known. */
export function useRuleEntrySummaries(url: string | null) {
  const { data: table } = useQuery({ ...textSourcesQuery(), enabled: Boolean(url) })
  const file = table && Object.entries(table).find(([, entry]) => entry.url === url)?.[0]
  const { data } = useQuery({ ...ruleSummariesQuery(file ?? ''), enabled: Boolean(file) })
  return (entry: string): RuleSummary | undefined => {
    const id = data?.entries[entry]
    return id ? data.records[id] : undefined
  }
}
