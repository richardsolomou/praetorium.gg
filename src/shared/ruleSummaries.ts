import type { RuleSummaries } from '../contracts/rules'
import type { TextToken } from '../core/sourceText'

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

/**
 * The tokens with each naming a file a data update replaced moved to the file its string lives in now, where `homes`
 * names one by its hash: an older battle or saved reminder keeps the tokens it began with.
 */
export const tokensAtHome = (
  tokens: readonly TextToken[],
  ofFile: ReadonlyMap<string, RuleSummaries | undefined>,
  homes: Readonly<Record<string, string | null>> | undefined,
): TextToken[] =>
  tokens.map((token) => {
    const home = ofFile.get(token.file)?.replaced && homes?.[token.hash]
    return home ? { ...token, file: home } : token
  })
