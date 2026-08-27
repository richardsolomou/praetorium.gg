import path from 'node:path'
import { detachmentCatalogueDetail } from '../src/server/catalogueDescriptions'
import { loadCatalogue } from '../src/server/catalogueIndex'
import { routeSlug } from '../src/core/slug'
import { loadRules } from '../src/server/rules'

/** Add `--details` to print every missing item as faction | detachment | name. */
const directory = process.env.CATALOGUE_DIR ?? path.join(import.meta.dirname, '..', 'catalogue-data')
const rules = loadRules(path.join(directory, 'rules'))
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

/*
 * A ratchet, so these only ever come down. The rules dataset picks up new detachments before
 * Game Datacards describes them, so the gap is measured against the pinned snapshot rather
 * than expected to be zero. Five of the enhancements are spelt differently by the two sources
 * (the rules dataset's "Mask of the Nekrosor" is the cards' "Mark of the Nekrosor") and stay
 * blank until one of them is corrected upstream: a near match is a guess.
 */
if (missing.detachmentRules.length > 30 || missing.enhancements.length > 92 || missing.stratagems.length > 116) {
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
