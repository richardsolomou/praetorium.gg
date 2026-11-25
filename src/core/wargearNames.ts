import { routeSlug } from './slug'
import { remember } from './collections'

/** Whether two names describe the same piece of wargear, including a named mode or aura. */
export function sameWargear(one: string, other: string) {
  return wargearKey(one) === wargearKey(other)
}

const keys = new Map<string, string>()
/** Catalogue names are a bounded set, and matching runs for every weapon of every model. */
export const wargearKey = (name: string, includeUnmarkedModes = false) => {
  const asked = `${Number(includeUnmarkedModes)}${name}`
  return remember(keys, asked, () => routeSlug(wargearBaseName(name, includeUnmarkedModes)))
}

// A profile only for some targets, printed after its weapon's name ("Melta Rifle HUNTER:Monster/Vehicle", "(Hunter: Monster/Vehicle)").
const HUNTER = /\s*\(?\s*hunter\s*:\s*([^)]*?)\s*\)?\s*$/i

/** The target keywords a Hunter profile is limited to, or null for a profile any target allows. */
export const hunterTargets = (name: string) =>
  HUNTER.exec(name)?.[1]
    ?.split('/')
    .map((keyword) => keyword.trim()) ?? null

/** The shared name without a profile mode, aura label, or source marker. */
export const wargearBaseName = (name: string, includeUnmarkedModes = false) => {
  const trimmed = name.trim()
  const marked = /^[^\p{L}\p{N}]+/u.test(trimmed)
  const unmarked = trimmed.replace(/^[^\p{L}\p{N}]+/u, '')
  const mode = includeUnmarkedModes ? /\s*[-–—]\s+[^–—]+$/ : /\s+-\s+[^-]+$/
  const withoutMode = marked || includeUnmarkedModes ? unmarked.replace(mode, '').replace(HUNTER, '') : unmarked
  return withoutMode
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim()
    .toLowerCase()
}
