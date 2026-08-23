import type { gameReferences } from '../server/functions'

type References = Awaited<ReturnType<typeof gameReferences>> | undefined

/**
 * The deck of mission cards, which belongs to the instance rather than to an army.
 *
 * Every card the packs print is the same for both sides and for every battle on the
 * instance, so it is fetched once with the rest of the game references rather than
 * once per army with that army's stratagems — three armies asking for their own
 * detachment used to be three copies of the whole deck in one page, and a fourth
 * beside them here.
 *
 * Read through these two rather than off the shape, so the screen that prints a card
 * and the screen that scores it are always holding the same one.
 */
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
