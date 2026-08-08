import path from 'node:path'
import { loadRules } from '../src/server/rules'

const directory = process.env.CATALOGUE_DIR ?? path.join(import.meta.dirname, '..', 'catalogue-data')
const rules = loadRules(path.join(directory, 'rules'), path.join(directory, 'wahapedia'))
if (!rules) throw new Error('rules data is unavailable')

const detachments = Array.from(rules.detachmentDetails.values()).flatMap((faction) => Array.from(faction.values()))
const missing = {
  detachmentRules: detachments.filter((detachment) => !detachment.rules.length),
  enhancements: detachments.flatMap((detachment) => detachment.enhancements).filter((enhancement) => !enhancement.description),
  stratagems: detachments.flatMap((detachment) => detachment.stratagems).filter((stratagem) => !stratagem.description),
}

console.log(`detachment rules without descriptions: ${missing.detachmentRules.length}`)
console.log(`enhancements without descriptions: ${missing.enhancements.length}`)
console.log(`stratagems without descriptions: ${missing.stratagems.length}`)

if (missing.detachmentRules.length > 24 || missing.enhancements.length > 61 || missing.stratagems.length > 96) {
  throw new Error('description coverage fell below the pinned catalogue baseline')
}

for (const name of ['Hand of the Dynasty', 'Skyshroud Spearhead', 'The Phaeron’s Armoury']) {
  const detachment = detachments.find((candidate) => candidate.name === name)
  if (
    !detachment?.rules.length ||
    detachment.enhancements.some((entry) => !entry.description) ||
    detachment.stratagems.some((entry) => !entry.description)
  ) {
    throw new Error(`${name} is missing description data`)
  }
}
