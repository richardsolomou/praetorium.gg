import fs from 'node:fs'
import path from 'node:path'

/**
 * What each payout on a mission card asks for, in the words the pack prints.
 *
 * The rules source says when a payout is due and how the payouts on a card relate to
 * each other; the mission pack says what the player has to have done to take it.
 * Neither says both, so the two are read together and paired payout by payout.
 */
export type Payout = { vp: number; criteria: string }

/** Every card in every pack under `missions`, keyed by name. */
export function loadMissionCriteria(directory: string): Map<string, Payout[]> {
  const found = new Map<string, Payout[]>()
  const missions = path.join(directory, 'missions')
  if (!fs.existsSync(missions)) return found
  // A name in two packs is two cards until proven otherwise, so neither is used.
  const contested = new Set<string>()
  for (const fileName of fs.readdirSync(missions).filter((entry) => entry.endsWith('.json'))) {
    const parsed: unknown = JSON.parse(fs.readFileSync(path.join(missions, fileName), 'utf8'))
    for (const card of cardsIn(parsed)) {
      const name = cardName(card)
      const payouts = payoutsIn(card)
      if (!name || !payouts.length) continue
      if (found.has(name)) contested.add(name)
      found.set(name, payouts)
    }
  }
  for (const name of contested) found.delete(name)
  return found
}

/**
 * Which sentence belongs to which payout, or nothing when that cannot be settled.
 *
 * The two sources list a card's payouts in their own order, so the values are what
 * tie them together. Position settles it when the sequences already agree, and a
 * card whose values are all distinct can be matched whatever order they are in.
 * Anything else is left unpaired rather than guessed onto the wrong row.
 */
export function pairCriteria(awards: readonly { vp: number }[], payouts: readonly Payout[]): (string | null)[] {
  const unpaired = awards.map(() => null)
  if (payouts.length !== awards.length || !payouts.length) return unpaired
  if (awards.every((award, at) => award.vp === payouts[at]?.vp)) return payouts.map((payout) => payout.criteria)
  const values = awards.map((award) => award.vp)
  if (new Set(values).size !== values.length) return unpaired
  const byValue = new Map(payouts.map((payout) => [payout.vp, payout.criteria]))
  if (byValue.size !== payouts.length || !values.every((vp) => byValue.has(vp))) return unpaired
  return values.map((vp) => byValue.get(vp) ?? null)
}

/** Cards are keyed by name because the two sources give them unrelated ids. */
export const criteriaKey = (name: string) => name.toLocaleLowerCase().replaceAll(/\s+/g, ' ').trim()

function cardsIn(pack: unknown): Record<string, unknown>[] {
  if (!pack || typeof pack !== 'object') return []
  return ['primaryMissions', 'secondaryMissions'].flatMap((field) => {
    const cards: unknown = (pack as Record<string, unknown>)[field]
    return Array.isArray(cards) ? cards.filter((card): card is Record<string, unknown> => Boolean(card) && typeof card === 'object') : []
  })
}

function cardName(card: Record<string, unknown>): string | null {
  const english = english_(card.name)
  return english ? criteriaKey(english) : null
}

function payoutsIn(card: Record<string, unknown>): Payout[] {
  const objectives: unknown = card.objectives
  if (!Array.isArray(objectives)) return []
  return objectives.flatMap((objective: unknown) => {
    if (!objective || typeof objective !== 'object') return []
    const scoring: unknown = (objective as Record<string, unknown>).scoring
    if (!Array.isArray(scoring)) return []
    return scoring.flatMap((entry: unknown) => {
      if (!entry || typeof entry !== 'object') return []
      const vp: unknown = (entry as Record<string, unknown>).victoryPoints
      const criteria = english_((entry as Record<string, unknown>).scoringCriteria)
      return typeof vp === 'number' && criteria ? [{ vp, criteria }] : []
    })
  })
}

function english_(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const english: unknown = (value as Record<string, unknown>).en
  return typeof english === 'string' && english.trim() ? english.trim() : null
}
