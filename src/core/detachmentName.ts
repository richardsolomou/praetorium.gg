import { routeSlug } from './slug'

/** Names one source gives a detachment that another spells differently, each with the name the rest use. */
const ALIASES: readonly (readonly [alias: string, canonical: string])[] = [
  // BSData Library - Tyranids.json@b8667d4 names 0a59-1d64-257c-04fb in the singular; Game Datacards 11th/gdc/gsc.json@ebcd0cb in the plural.
  ['Brood Brother Auxilia', 'Brood Brothers Auxilia'],
  // BSData Imperium - Space Marines.json@b8667d4 marks 5eb6-4ed2-6aca-c7f1 unfinished, as lists exported then still do; Game Datacards, MFM and later BSData omit the suffix.
  ['Deathwatch Support (ITS NOT READY)', 'Deathwatch Support'],
]

export function canonicalDetachmentName(name: string) {
  const slug = routeSlug(name)
  return ALIASES.find(([alias]) => routeSlug(alias) === slug)?.[1] ?? name
}

/** Every name a detachment goes by, so a list exported under another spelling still finds it. */
export function detachmentNameVariants(name: string) {
  const canonical = canonicalDetachmentName(name)
  const aliases = ALIASES.filter(([, target]) => routeSlug(target) === routeSlug(canonical)).map(([alias]) => alias)
  return [...new Set([name, canonical, ...aliases])]
}
