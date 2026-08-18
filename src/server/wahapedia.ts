import fs from 'node:fs'
import path from 'node:path'
import * as cheerio from 'cheerio'
import { parse } from 'csv-parse/sync'
import { distance } from 'fastest-levenshtein'
import { compile } from 'html-to-text'
import { routeSlug } from '../core/slug'

export const WAHAPEDIA_ATTRIBUTION = 'Descriptions provided by Wahapedia'

type ExportRow = { name: string; detachment?: string; description?: string }

export type WahapediaDescriptions = {
  abilities: ReadonlyMap<string, string>
  detachmentAbilities: ReadonlyMap<string, readonly DetachmentAbility[]>
  enhancements: ReadonlyMap<string, string>
  stratagems: ReadonlyMap<string, string>
}

export type DetachmentAbility = { name: string; description: string }

export type FactionRestrictions = {
  excludedNames: ReadonlySet<string>
  excludedKeywords: ReadonlySet<string>
}

const toText = compile({
  wordwrap: false,
  selectors: [
    { selector: 'a', options: { ignoreHref: true } },
    { selector: 'img', format: 'skip' },
    { selector: 'table.customTable', format: 'dataTable', options: { colSpacing: 2, maxColumnWidth: 80 } },
    { selector: 'table.wTable', format: 'dataTable', options: { colSpacing: 2, maxColumnWidth: 80 } },
  ],
})

export function loadWahapediaDescriptions(directory: string): WahapediaDescriptions | null {
  const live = readLivePages(path.join(directory, 'pages'))
  const abilities = readNamedDescriptions([path.join(directory, 'Abilities.csv'), path.join(directory, 'Datasheets_abilities.csv')])
  const detachmentAbilities = mergeDetachmentAbilities(
    readDetachmentAbilities(path.join(directory, 'Detachment_abilities.csv')),
    live.detachmentAbilities,
  )
  const enhancements = new Map([...readDescriptions(path.join(directory, 'Enhancements.csv')), ...live.enhancements])
  const stratagems = new Map([...readDescriptions(path.join(directory, 'Stratagems.csv')), ...live.stratagems])
  return abilities.size || detachmentAbilities.size || enhancements.size || stratagems.size
    ? { abilities, detachmentAbilities, enhancements, stratagems }
    : null
}

function readLivePages(directory: string) {
  const detachmentAbilities = new Map<string, DetachmentAbility[]>()
  const enhancements = new Map<string, string>()
  const stratagems = new Map<string, string>()
  if (!fs.existsSync(directory)) return { detachmentAbilities, enhancements, stratagems }

  for (const file of fs.readdirSync(directory).filter((name) => name.endsWith('.html'))) {
    const $ = cheerio.load(fs.readFileSync(path.join(directory, file), 'utf8'))
    $('div.clFl').each((_, element) => {
      const detachment = $(element)
        .children('h2.outline_header')
        .first()
        .text()
        .replace(/\d+DP$/, '')
        .trim()
      if (!detachment) return
      const key = routeSlug(detachment)
      // Newer faction pages wrap some sections (including Cursed Legion's
      // stratagems) in another layout layer, while older pages put Columns2
      // directly under the detachment. Both belong to this detachment block.
      const columns = $(element).find('.Columns2')

      const rules: DetachmentAbility[] = []
      columns.children('.BreakInsideAvoid').each((__, section) => {
        const heading = $(section).children('h3').first().text().trim()
        if (!heading) return
        const content = $(section).clone()
        content.find('h3, .ShowFluff').remove()
        const description = toText(content.html() ?? '').trim()
        if (description) rules.push({ name: heading, description })
      })
      if (rules.length) detachmentAbilities.set(key, rules)

      columns.find('ul.EnhancementsPts').each((__, list) => {
        const title = $(list).find('li > span').first().clone()
        const upgrade = title.find('.EnhUpgrade').remove().length > 0
        const name = `${title.text().trim()}${upgrade ? ' (Upgrade)' : ''}`
        const content = $(list).closest('.td_w').clone()
        content.find('ul.EnhancementsPts, .ShowFluff, .faqErrataStrat').remove()
        const description = toText(content.html() ?? '').trim()
        if (name && description) enhancements.set(descriptionKey(detachment, name), description)
      })

      columns.find('.str11Wrap').each((__, card) => {
        const name = $(card).find('.str11Name').first().text().trim()
        const description = toText($(card).find('.str11Text').first().html() ?? '').trim()
        if (name && description) stratagems.set(descriptionKey(detachment, name), description)
      })
    })
  }
  return { detachmentAbilities, enhancements, stratagems }
}

function mergeDetachmentAbilities(
  fallback: ReadonlyMap<string, readonly DetachmentAbility[]>,
  preferred: ReadonlyMap<string, readonly DetachmentAbility[]>,
) {
  const merged = new Map(fallback)
  for (const [detachment, rules] of preferred) {
    const byName = new Map((merged.get(detachment) ?? []).map((rule) => [routeSlug(rule.name), rule]))
    for (const rule of rules) byName.set(routeSlug(rule.name), rule)
    merged.set(detachment, [...byName.values()])
  }
  return merged
}

export const descriptionKey = (detachment: string, name: string) => `${routeSlug(detachment)}|${routeSlug(name)}`

export function findDescription(descriptions: ReadonlyMap<string, string>, detachment: string, name: string): string | null {
  const exact = descriptions.get(descriptionKey(detachment, name))
  if (exact) return exact

  const detachmentTarget = routeSlug(detachment)
  const target = comparableName(name)
  const matches = [...descriptions].filter(([key]) => {
    const separator = key.indexOf('|')
    const candidateDetachment = key.slice(0, separator)
    const candidateName = key.slice(separator + 1)
    return near(detachmentTarget, candidateDetachment) && near(target, comparableName(candidateName))
  })
  return matches.length === 1 ? matches[0][1] : null
}

const comparableName = (name: string) => routeSlug(name).replace(/-(?:aura|upgrade)$/, '')

const near = (target: string, candidate: string) =>
  distance(target, candidate) <= Math.min(3, Math.max(1, Math.floor(target.length * 0.15)))

export function findDetachmentAbilities(
  abilities: ReadonlyMap<string, readonly DetachmentAbility[]>,
  detachment: string,
): readonly DetachmentAbility[] {
  const exact = abilities.get(routeSlug(detachment))
  if (exact) return exact

  const target = routeSlug(detachment)
  const maximumDistance = Math.min(3, Math.max(1, Math.floor(target.length * 0.15)))
  const matches = [...abilities].filter(([key]) => distance(target, key) <= maximumDistance)
  return matches.length === 1 ? matches[0][1] : []
}

export const findAbilityDescription = (descriptions: ReadonlyMap<string, string>, name: string) => descriptions.get(routeSlug(name)) ?? null

export function factionRestrictions(descriptions: ReadonlyMap<string, string>) {
  const restrictions = new Map<string, { excludedNames: Set<string>; excludedKeywords: Set<string> }>()
  const forFaction = (faction: string) => {
    const key = routeSlug(faction)
    const found = restrictions.get(key) ?? { excludedNames: new Set<string>(), excludedKeywords: new Set<string>() }
    restrictions.set(key, found)
    return found
  }
  for (const [faction, description] of descriptions) {
    const describedFaction = description.match(/from the ([A-Za-z ]+) Chapter/i)?.[1] ?? faction
    for (const match of description.matchAll(
      /Your army cannot include (?:any of )?the following (?:units|models|datasheets[^:]*):\s*([^.]*)/gi,
    )) {
      addNames(forFaction(describedFaction).excludedNames, match[1])
    }
    for (const match of description.matchAll(
      /If your army includes one or more ([A-Z][A-Z ]+) units, it cannot include[^.]*?the following (?:units|models):\s*([^.]*)/g,
    )) {
      addNames(forFaction(match[1]).excludedNames, match[2])
    }
    if (/BLACK TEMPLARS units[^.]*cannot include any Adeptus Astartes Psyker models/i.test(description)) {
      forFaction('Black Templars').excludedKeywords.add('psyker')
    }
  }
  return restrictions
}

export function factionRestrictionCoverageIssues(descriptions: ReadonlyMap<string, string>) {
  const parsed = factionRestrictions(descriptions)
  const issues: string[] = []
  for (const [rule, description] of descriptions) {
    for (const match of description.matchAll(/cannot include[^.]*?following (?:units|models|datasheets[^:]*):\s*([^.]*)/gi)) {
      const before = description.slice(0, match.index)
      const conditionalFaction = [...before.matchAll(/If your army includes one or more ([A-Z][A-Z ]+) units,/g)].at(-1)?.[1]
      const describedFaction = description.match(/from the ([A-Za-z ]+) Chapter/i)?.[1]
      const faction = routeSlug(conditionalFaction ?? describedFaction ?? rule)
      const names = new Set<string>()
      addNames(names, match[1])
      const missing = [...names].filter((name) => !parsed.get(faction)?.excludedNames.has(name))
      if (missing.length) issues.push(`${rule}: ${missing.join(', ')}`)
    }
  }
  return issues
}

const addNames = (target: Set<string>, names: string | undefined) =>
  names
    ?.split(';')
    .map((name) =>
      name
        .replace(/^[^:]+:\s*/, '')
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean)
    .forEach((name) => target.add(name))

function readNamedDescriptions(files: readonly string[]): Map<string, string> {
  const candidates = new Map<string, Set<string>>()
  for (const file of files) {
    for (const row of readRows(file)) {
      if (!row.name || !row.description) continue
      const description = toText(row.description).trim()
      if (!description) continue
      const descriptions = candidates.get(routeSlug(row.name)) ?? new Set<string>()
      descriptions.add(description)
      candidates.set(routeSlug(row.name), descriptions)
    }
  }
  return uniqueDescriptions(candidates)
}

function readDetachmentAbilities(file: string): Map<string, readonly DetachmentAbility[]> {
  const grouped = new Map<string, Map<string, Set<string>>>()
  for (const row of readRows(file)) {
    if (!row.name || !row.detachment || !row.description) continue
    const description = toText(row.description).trim()
    if (!description) continue
    const abilities = grouped.get(routeSlug(row.detachment)) ?? new Map<string, Set<string>>()
    const descriptions = abilities.get(row.name) ?? new Set<string>()
    descriptions.add(description)
    abilities.set(row.name, descriptions)
    grouped.set(routeSlug(row.detachment), abilities)
  }
  return new Map(
    [...grouped].map(([detachment, abilities]) => [
      detachment,
      [...abilities]
        .filter(([, descriptions]) => descriptions.size === 1)
        .map(([name, descriptions]) => ({ name, description: descriptions.values().next().value! })),
    ]),
  )
}

function readDescriptions(file: string): Map<string, string> {
  const candidates = new Map<string, Set<string>>()
  for (const row of readRows(file)) {
    if (!row.name || !row.description) continue
    const description = toText(row.description).trim()
    if (!description) continue
    const key = descriptionKey(row.detachment ?? '', row.name)
    const existing = candidates.get(key) ?? new Set<string>()
    existing.add(description)
    candidates.set(key, existing)
  }
  return uniqueDescriptions(candidates)
}

const uniqueDescriptions = (candidates: ReadonlyMap<string, Set<string>>) =>
  new Map(
    [...candidates]
      .filter(([, descriptions]) => descriptions.size === 1)
      .map(([key, descriptions]) => [key, descriptions.values().next().value!]),
  )

function readRows(file: string): ExportRow[] {
  if (!fs.existsSync(file)) return []
  return parse<ExportRow>(fs.readFileSync(file, 'utf8'), {
    bom: true,
    columns: true,
    delimiter: '|',
    quote: false,
    relax_column_count: true,
    skip_empty_lines: true,
  })
}
