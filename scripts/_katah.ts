// One-off: what Martial Ka'tah's text and name join on a Custodes datasheet. Ids only.
import path from 'node:path'
import { vsDataSummariesSteps } from '../src/server/vsDataSummaries'
import { completeSteps } from '../src/shared/steps'
import { wholeRuleTokens, recordsPrinting } from '../src/shared/ruleSummaries'
import { datasheetAbilitySummary } from '../src/shared/vsDataAbilities'
import { datasheetIn } from '../src/shared/catalogue'
import { hasTextTokens } from '../src/core/sourceText'
import { catalogueDataDirectory } from './lib/catalogueFiles'
import { loadSnapshotWithRules } from './lib/catalogueSnapshotLoad'

const directory = path.resolve(catalogueDataDirectory())
const { catalogue, rules } = loadSnapshotWithRules(directory)
const read = completeSteps(vsDataSummariesSteps(directory, rules.ruleDocuments))!
const records = read.recordsIn(null)!
const faction = catalogue.factions.find((f) => /custodes/i.test(f.name))!
for (const id of [...(catalogue.index.datasheets.get(faction.id) ?? [])].slice(0, 40)) {
  const sheet = datasheetIn(catalogue, faction.id, id)
  const ability = sheet?.abilities.find((a) => /ka.tah/i.test(a.name))
  if (!sheet || !ability) continue
  const text = ability.description ?? ''
  const tokens = wholeRuleTokens(text)
  const printed = recordsPrinting(tokens, new Map(tokens.map((t) => [t.file, read.summariesIn(t.file)]))).map(({ id }) => ({ id, summary: id }))
  console.log(JSON.stringify({ sheet: sheet.name, ability: ability.name, kind: ability.kind, id: ability.id, tokens: hasTextTokens(text), printed: printed.map((p) => p.id), alias: records.aliases[ability.id] ?? null, noName: datasheetAbilitySummary(null, '', undefined, printed), withName: datasheetAbilitySummary(records, id, ability.id, printed, ability.name) }))
  break
}
