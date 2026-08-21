import path from 'node:path'
import fs from 'node:fs'
import { detachmentCatalogueDetail } from '../src/server/catalogueDescriptions'
import { loadCatalogue } from '../src/server/catalogueIndex'
import { routeSlug } from '../src/core/slug'
import { loadRules } from '../src/server/rules'

/** Add `--details` to print every missing item as faction | detachment | name. */
const directory = process.env.CATALOGUE_DIR ?? path.join(import.meta.dirname, '..', 'catalogue-data')
const rules = loadRules(path.join(directory, 'rules'), path.join(directory, 'wahapedia'))
if (!rules) throw new Error('rules data is unavailable')
const catalogue = loadCatalogue(directory)
if (!catalogue) throw new Error('catalogue data is unavailable')

const detachments = Array.from(rules.detachmentDetails, ([faction, details]) =>
  Array.from(details.values(), (detail) => {
    const options = Array.from(catalogue.index.catalogues.values()).flatMap((book) =>
      routeSlug(book.name) === faction
        ? (catalogue.detachments.get(book.id)?.options.filter((option) => routeSlug(option.name) === routeSlug(detail.name)) ?? []).map(
            (option) => ({
              book,
              option,
            }),
          )
        : [],
    )
    const catalogueDetails = options.flatMap(({ book, option }) => {
      const found = detachmentCatalogueDetail(
        catalogue,
        book.id,
        option.id,
        [...detail.enhancements, ...detail.upgrades].map((enhancement) => enhancement.name),
      )
      return found ? [found] : []
    })
    return { faction, detail, catalogueDetails }
  }),
).flat()
const missing = {
  detachmentRules: detachments.filter(
    ({ detail, catalogueDetails }) => !detail.rules.length && !catalogueDetails.some((candidate) => candidate.rule?.description),
  ),
  enhancements: detachments.flatMap(({ faction, detail, catalogueDetails }) =>
    [...detail.enhancements, ...detail.upgrades]
      .filter(
        (enhancement) =>
          !enhancement.description &&
          !catalogueDetails.some((candidate) =>
            candidate.enhancements.some(
              (found) => found.name.toLocaleLowerCase() === enhancement.name.toLocaleLowerCase() && found.description,
            ),
          ),
      )
      .map((enhancement) => ({ faction, detachment: detail.name, name: enhancement.name })),
  ),
  stratagems: detachments.flatMap(({ faction, detail }) =>
    detail.stratagems
      .filter((stratagem) => !stratagem.description)
      .map((stratagem) => ({ faction, detachment: detail.name, name: stratagem.name })),
  ),
}

type Localized = { en?: string }
type DatacardsFaction = {
  rules?: { detachment?: { detachment?: string; rules?: { rules?: { text?: Localized }[] }[] }[] }
  enhancements?: { detachment?: string; name?: Localized; description?: Localized }[]
  stratagems?: { detachment?: string; name?: Localized; effect?: Localized }[]
}

const datacardsDirectory = path.join(directory, 'datacards', '11th', 'gdc')
if (fs.existsSync(datacardsDirectory)) {
  const jsonFiles = (root: string): string[] =>
    fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
      const file = path.join(root, entry.name)
      if (entry.isDirectory()) return jsonFiles(file)
      return entry.isFile() && entry.name.endsWith('.json') ? [file] : []
    })
  const datacards = jsonFiles(datacardsDirectory).map((file) => JSON.parse(fs.readFileSync(file, 'utf8')) as DatacardsFaction)
  const hasText = (value: string | undefined) => Boolean(value?.trim())
  const covered = {
    detachmentRules: missing.detachmentRules.filter(({ detail }) =>
      datacards.some((faction) =>
        faction.rules?.detachment?.some(
          (candidate) =>
            routeSlug(candidate.detachment ?? '') === routeSlug(detail.name) &&
            candidate.rules?.some((rule) => rule.rules?.some((part) => hasText(part.text?.en))),
        ),
      ),
    ),
    enhancements: missing.enhancements.filter((entry) =>
      datacards.some((faction) =>
        faction.enhancements?.some(
          (candidate) =>
            routeSlug(candidate.detachment ?? '') === routeSlug(entry.detachment) &&
            routeSlug(candidate.name?.en ?? '') === routeSlug(entry.name) &&
            hasText(candidate.description?.en),
        ),
      ),
    ),
    stratagems: missing.stratagems.filter((entry) =>
      datacards.some((faction) =>
        faction.stratagems?.some(
          (candidate) =>
            routeSlug(candidate.detachment ?? '') === routeSlug(entry.detachment) &&
            routeSlug(candidate.name?.en ?? '') === routeSlug(entry.name) &&
            hasText(candidate.effect?.en),
        ),
      ),
    ),
  }
  console.log(`Game Datacards coverage of missing detachment rules: ${covered.detachmentRules.length}/${missing.detachmentRules.length}`)
  console.log(`Game Datacards coverage of missing enhancements: ${covered.enhancements.length}/${missing.enhancements.length}`)
  console.log(`Game Datacards coverage of missing stratagems: ${covered.stratagems.length}/${missing.stratagems.length}`)
}

console.log(`detachment rules without descriptions: ${missing.detachmentRules.length}`)
console.log(`enhancements without descriptions: ${missing.enhancements.length}`)
console.log(`stratagems without descriptions: ${missing.stratagems.length}`)

if (process.argv.includes('--details')) {
  const print = (heading: string, entries: readonly { faction: string; detachment: string; name: string }[]) => {
    console.log(`\n${heading}`)
    for (const entry of entries) console.log(`${entry.faction} | ${entry.detachment} | ${entry.name}`)
  }
  print(
    'Detachment rules',
    missing.detachmentRules.map(({ faction, detail }) => ({ faction, detachment: detail.name, name: 'Detachment rule' })),
  )
  print('Enhancements', missing.enhancements)
  print('Stratagems', missing.stratagems)
}

// Preserve roughly 95% coverage while the independently pinned rules and description snapshots differ.
if (missing.detachmentRules.length > 24 || missing.enhancements.length > 64 || missing.stratagems.length > 101) {
  throw new Error('description coverage fell below the pinned catalogue baseline')
}

for (const name of ['Hand of the Dynasty', 'Skyshroud Spearhead', 'The Phaeron’s Armoury']) {
  if (
    missing.detachmentRules.some(({ detail }) => detail.name === name) ||
    missing.enhancements.some((entry) => entry.detachment === name) ||
    missing.stratagems.some((entry) => entry.detachment === name)
  ) {
    throw new Error(`${name} is missing description data`)
  }
}
