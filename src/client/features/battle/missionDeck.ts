import type { gameReferences } from '../../../server/functions'

type References = Awaited<ReturnType<typeof gameReferences>> | undefined

/** Read the instance’s shared mission deck once for both display and scoring, rather than fetching a copy per army. */
export const secondaryCards = (references: References) => references?.secondaries ?? []

/**
 * The primaries, gathered from the packs that print them.
 *
 * A mission carries its own card, and the same card can be printed by more than one
 * pack, so they are collected by key rather than concatenated.
 */
export function primaryCards(references: References) {
  const found = new Map<string, NonNullable<NonNullable<References>['packs'][number]['missions'][number]['card']>>()
  for (const pack of references?.packs ?? []) {
    for (const mission of pack.missions) if (mission.card && !found.has(mission.card.key)) found.set(mission.card.key, mission.card)
  }
  return [...found.values()]
}

export function missionCardsByKey(references: References) {
  const found = new Map<string, ReturnType<typeof primaryCards>[number]>()
  for (const card of [...primaryCards(references), ...secondaryCards(references)]) {
    if (!found.has(card.key)) found.set(card.key, card)
  }
  return found
}
