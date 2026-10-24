type Army<P> = { id: P; roster: { built?: { units: readonly { warlord?: boolean }[] } } | null }

/** The armies on a side whose lists name a Warlord, any of which may lead allies who combined their lists. */
export function teamWarlordChoices<P>(armies: readonly Army<P>[]): P[] {
  return armies.flatMap((army) => (army.roster?.built?.units.some((unit) => unit.warlord) ? [army.id] : []))
}

/** The army whose Warlord leads the side: its valid pick, else its only choice; null while allies still owe a choice. */
export function teamWarlord<P>(armies: readonly Army<P>[], picked: P | null): P | null {
  const choices = teamWarlordChoices(armies)
  if (picked !== null && choices.includes(picked)) return picked
  return choices.length === 1 ? choices[0]! : null
}
