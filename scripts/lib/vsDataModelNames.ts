/** Names compared by their letters and digits alone, without the "upgrade" BSData adds to some (Character upgrade). */
export const same = (name: string) =>
  name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/\bupgrade$/, '')
    .replace(/[^a-z0-9]/g, '')

/** A name's words, each without a closing s, so Relic Terminators reads as Relic Terminator. */
export const words = (name: string) =>
  new Set(
    name
      .normalize('NFKD')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((word) => word.replace(/s$/, ''))
      .filter(Boolean),
  )

type Model = { id: string; name: string }

/**
 * The VS Data models a BSData model name stands for: those named alike, else those scoring best on the words they share
 * less the words only theirs (leaving out the unit's own name, `unitWords`), as Paladin with Ancient's Banner is
 * Paladin Ancient and Assault Terminator w/ claws is Terminator, not Terminator Sergeant; else those its profile names.
 */
export function modelsNamed(
  models: readonly Model[],
  unitWords: ReadonlySet<string>,
  name: string | null | undefined,
  profile?: string | null,
): string[] | undefined {
  if (!name) return undefined
  const alike = models.filter((model) => same(model.name) === same(name))
  if (alike.length) return alike.map(({ id }) => id)
  const named = words(name)
  const shared = (model: Model) => [...words(model.name)].filter((word) => named.has(word)).length
  const score = (model: Model) => shared(model) - [...words(model.name)].filter((word) => !named.has(word) && !unitWords.has(word)).length
  const sharing = models.filter((model) => shared(model) > 0)
  const best = Math.max(...sharing.map(score))
  return sharing.length ? sharing.filter((model) => score(model) === best).map(({ id }) => id) : modelsNamed(models, unitWords, profile)
}
