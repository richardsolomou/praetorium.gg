import { diceExpression, type DiceExpression } from './combat'

export const normalizeCombatKeyword = (text: string) =>
  text
    .replaceAll(/\p{Pd}/gu, '-')
    .replaceAll(/[[\]]/g, '')
    .trim()
    .toLowerCase()

const simple = [
  'torrent',
  'lethal hits',
  'devastating wounds',
  'twin-linked',
  'ignores cover',
  'indirect fire',
  'psychic',
  'heavy',
  'lance',
  'assault',
  'close-quarters',
  'extra attacks',
  'hazardous',
  'precision',
  'one shot',
] as const
type KeywordKind = (typeof simple)[number] | 'sustained hits' | 'rapid fire' | 'melta' | 'blast' | 'cleave' | 'anti'
export type CombatKeyword = {
  kind: KeywordKind
  amount?: number | DiceExpression
  critical?: number
  target?: { keywords: string[]; excluded: boolean }
}

function targets(text: string): NonNullable<CombatKeyword['target']> | null {
  const excluded = text.startsWith('non-')
  const keywords = (excluded ? text.slice(4) : text).split('/').map((part) => part.trim())
  return keywords.every((word) => /^[a-z][a-z0-9 '-]*$/.test(word)) ? { keywords, excluded } : null
}

export function combatKeyword(text: string): CombatKeyword | null {
  const [written = '', restriction, extra] = normalizeCombatKeyword(text).split(/\s*:\s*/)
  if (extra !== undefined) return null
  const target = restriction === undefined ? undefined : targets(restriction)
  if (target === null) return null
  const suffix = target ? { target } : {}
  const name = written.replace(/^pistol$/, 'close-quarters').replace(/^twin linked$/, 'twin-linked')
  const plain = simple.find((kind) => kind === name)
  if (plain) return { kind: plain, ...suffix }
  const numbered = /^(sustained hits|rapid fire|melta|blast|cleave)\s+(.+)$/.exec(name)
  if (numbered) {
    const kind = numbered[1] as KeywordKind
    const amount = diceExpression(numbered[2]!)
    if (!amount || amount.dice + amount.bonus === 0 || ((kind === 'blast' || kind === 'cleave') && (amount.dice || amount.bonus > 10)))
      return null
    return { kind, amount: amount.dice ? amount : amount.bonus, ...suffix }
  }
  if (name === 'blast') return { kind: 'blast', amount: 1, ...suffix }
  const anti = /^anti[- ](.+) ([2-6])\+?$/.exec(name)
  if (anti && !target) {
    const against = targets(anti[1]!)
    if (against) return { kind: 'anti', critical: Number(anti[2]), target: against }
  }
  return null
}

export function combatKeywordApplies(keyword: CombatKeyword, targetKeywords: readonly string[]) {
  if (!keyword.target) return true
  const held = new Set(targetKeywords.map(normalizeCombatKeyword))
  const matches = keyword.target.keywords.some((word) => held.has(word))
  return keyword.target.excluded ? !matches : matches
}

export function combatKeywordPhraseMatches(phrase: string, keywords: readonly string[]) {
  let remaining = phrase
  for (const keyword of keywords.toSorted((a, b) => b.length - a.length))
    remaining = remaining.replaceAll(new RegExp(`\\b${keyword.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b`, 'g'), '').trim()
  return !remaining
}
