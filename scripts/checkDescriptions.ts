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

/*
 * A ratchet, so these only ever come down. They were raised when the rules revision
 * moved: the newer 40kdc data brings detachments the pinned Wahapedia snapshot does
 * not describe yet, which grows the dataset rather than degrading it. Coverage at the
 * time of writing is 446/470 detachment rules, 1548/1623 enhancements and 2106/2227
 * stratagems — about 95% of each. Re-pinning Wahapedia to a snapshot that reaches the
 * new detachments is what lowers these again.
 */
if (missing.detachmentRules.length > 24 || missing.enhancements.length > 75 || missing.stratagems.length > 121) {
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
