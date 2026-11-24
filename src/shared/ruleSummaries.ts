import type { RuleSummaries, RuleSummary } from '../contracts/rules'
import { hasTextTokens, type TextToken, textToken, textTokensIn } from '../core/sourceText'

/** A summary describes a whole rule, so it stands in only for tokens showing whole strings, not one bullet of a list. */
const WHOLE_STRING = new Set(['prose', 'plain', 'trim'])

/** The tokens of a text a summary can stand in for: none unless every one shows a whole string. */
export function wholeRuleTokens(text: string) {
  const tokens = hasTextTokens(text) ? textTokensIn(text) : []
  return tokens.every((token) => WHOLE_STRING.has(token.transform)) ? tokens : []
}

/** The whole rule a clause of it is cut from, as a card's When Drawn condition is from its When Drawn rule. */
export const wholeRuleOf = (clause: string) =>
  textTokensIn(clause)
    .map((token) => textToken({ ...token, transform: 'plain' }))
    .join('')

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

/** A summary as plain text, for a screen that draws no markup: paragraphs apart, list items on lines of their own. */
export const summaryPlainText = ({ blocks }: RuleSummary) =>
  blocks
    .map((block) =>
      'paragraph' in block
        ? block.paragraph.map((run) => run.text).join('')
        : block.items
            .map((item, at) => `${block.list === 'ordered' ? `${at + 1}.` : '•'} ${item.map((run) => run.text).join('')}`)
            .join('\n'),
    )
    .join('\n\n')

/**
 * The keys a weapon or core ability, or a core rule such as Benefit of Cover that an ability grants, named on a
 * datasheet may have: its name, then without the value it takes, as "Feel No Pain 5+" is the core ability Feel No Pain.
 */
export function abilityKeysNamed(name: string) {
  const slug = name
    .normalize('NFKC')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '')
  const plain = slug.replace(/-d?\d+$/, '')
  return [...new Set([slug, plain])].flatMap((key) => [`weapon-ability:${key}`, `core-ability:${key}`, `core-rule:${key}`])
}
