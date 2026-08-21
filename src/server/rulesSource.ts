import fs from 'node:fs'
import path from 'node:path'

/**
 * Reading the rules files, and the two ways this app keys what it finds in them.
 *
 * Every other `rules*` module reads through here, so a missing file is a silent
 * absence in exactly one place: the dataset is optional and an instance without it
 * still serves battles.
 */

/** Sits inside the catalogue directory, so one sync brings every source. */
export function rulesDirectory(dataDirectory = process.env.DATA_DIR ?? '/data') {
  return process.env.RULES_DIR ?? path.join(path.resolve(dataDirectory), 'catalogue', 'rules')
}

export function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

/** Nothing rather than a throw: an absent file means the dataset does not carry that part. */
export function readOptionalList<T>(file: string): T[] {
  return fs.existsSync(file) ? readJson<T[]>(file) : []
}

/** Every faction directory in the core dataset, skipping the ones it marks internal. */
export function factionDirectories(core: string): string[] {
  return fs
    .readdirSync(core, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
    .map((entry) => entry.name)
}

/**
 * Upstream ids transliterate accents that our route slugs drop, so "Khârn" is
 * `kharn` there and `kh-rn` here. Folding the accent back rather than changing
 * `routeSlug`, which is what existing links are already built from.
 */
export const joinKey = (nameOrSlug: string) =>
  nameOrSlug
    .normalize('NFD')
    .replaceAll(/\p{M}+/gu, '')
    .toLocaleLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '')

// An apostrophe is not a word boundary: "Mortarion's Teachings", never "Mortarion'S".
export const titleCase = (name: string) =>
  name
    .toLocaleLowerCase()
    .replaceAll(/(^|[\s(\-–—])([a-z])/g, (_, before: string, letter: string) => `${before}${letter.toLocaleUpperCase()}`)

export const byName = (left: { name: string }, right: { name: string }) => left.name.localeCompare(right.name)
