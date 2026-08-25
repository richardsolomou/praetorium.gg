export function disambiguatedPlayerLabels(players: readonly { id: string; name: string }[]) {
  const counts = new Map<string, number>()
  for (const player of players) counts.set(player.name, (counts.get(player.name) ?? 0) + 1)
  return new Map(
    players.map((player) => [player.id, counts.get(player.name) === 1 ? player.name : `${player.name} · ${player.id.slice(0, 8)}`]),
  )
}
