import { countBy } from '../core/collections'

export function disambiguatedPlayerLabels(players: readonly { id: string; name: string }[]) {
  const counts = countBy(players, (player) => player.name)
  return new Map(
    players.map((player) => [player.id, counts.get(player.name) === 1 ? player.name : `${player.name} · ${player.id.slice(0, 8)}`]),
  )
}

/** League entrants keyed by user, told apart the same way wherever they are listed. */
export const entrantLabels = (entries: readonly { userId: string; name: string }[]) =>
  disambiguatedPlayerLabels(entries.map((entry) => ({ id: entry.userId, name: entry.name })))
