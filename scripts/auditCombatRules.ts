import path from 'node:path'
import fs from 'node:fs'
import { parseArgs } from 'node:util'
import { combatReadingFor } from '../src/core/combatReading'
import { combatRuleChoices, type CombatRule } from '../src/core/combatRules'
import { combatFactsIn } from '../src/shared/textFacts'
import { datasheetIn } from '../src/shared/catalogue'
import { describeDatasheetAbilities } from '../src/shared/datasheetDescriptions'
import { combatWeaponKeywordInventory, unselectedCombatRules } from './lib/combatRuleInventory'
import type { InventoryRule } from './lib/combatRuleShortlist'
import { loadSnapshotWithRules } from './lib/catalogueSnapshotLoad'
import { catalogueDataDirectory } from './lib/catalogueFiles'
import { snapshotWords } from '../src/server/sourceTexts'

const { values } = parseArgs({ options: { json: { type: 'boolean' }, faction: { type: 'string' } } })
const directory = path.resolve(catalogueDataDirectory())
const { catalogue: loaded, rules } = loadSnapshotWithRules(directory)
// The snapshot publishes rules text as tokens; the words are read back only for the judge to read.
const words = snapshotWords(directory)
const entries = new Map<string, InventoryRule>()
const STRATAGEM_PHASES: NonNullable<CombatRule['phases']>[] = [['ranged'], ['melee'], ['ranged', 'melee']]
function add(name: string, published: string | null, source: string, scope: CombatRule['scope']) {
  const description = published && (words(published) ?? published)
  if (!description || (values.faction && !source.toLowerCase().includes(values.faction.toLowerCase()))) return
  const key = JSON.stringify([name, description])
  const existing = entries.get(key)
  if (existing) {
    if (!existing.sources.includes(source)) existing.sources.push(source)
    if (existing.scopes.includes(scope)) return
  }
  // What the simulator calculates is the reading the catalogue recorded for the text's VS Data record at this placement,
  // and a Stratagem's is recorded for each set of phases the simulator gives one.
  const placed: CombatRule = { id: key, name, description, source, scope, models: 1 }
  const facts = combatFactsIn(published, loaded.index.textFacts)
  const placements = scope === 'stratagem' ? STRATAGEM_PHASES.map((phases) => ({ ...placed, phases })) : [placed]
  const read = placements.flatMap((rule) => {
    const reading = facts === undefined ? null : combatReadingFor(facts, rule)
    return reading ? [{ ...rule, reading }] : []
  })
  const compiled = read.some((rule) => rule.reading.compiled)
  const choices = read.flatMap((rule) => combatRuleChoices(rule))
  const calculatedRoles = [...new Set(choices.flatMap((choice) => choice.effects.map((effect) => effect.role)))]
  const roles = compiled ? calculatedRoles : [...new Set(read.flatMap((rule) => rule.reading.roles))]
  const calculated = choices.some((choice) => choice.effects.length)
  entries.set(key, {
    name,
    description,
    sources: existing?.sources ?? [source],
    scopes: [...(existing?.scopes ?? []), scope],
    roles: [...new Set([...(existing?.roles ?? []), ...roles])],
    calculatedRoles: [...new Set([...(existing?.calculatedRoles ?? []), ...calculatedRoles])],
    calculated: calculated || Boolean(existing?.calculated),
    status: calculated ? 'calculated' : (existing?.status ?? (compiled ? 'no-damage-effect' : roles.length ? 'unsupported' : 'not-combat')),
  })
}
for (const rule of unselectedCombatRules(loaded)) add(rule.name, rule.description, rule.source, 'unit')
for (const faction of new Set(loaded.datacards.factions.values())) {
  for (const rule of faction.armyRules) add(rule.name, rule.description, faction.name, 'detachment')
  for (const [detachment, detachmentRules] of faction.detachmentRules)
    for (const rule of detachmentRules) add(rule.name, rule.description, `${faction.name} / ${detachment}`, 'detachment')
  for (const [detachment, enhancements] of faction.enhancements)
    for (const rule of enhancements) add(rule.name, rule.description, `${faction.name} / ${detachment}`, 'unit')
}
for (const faction of loaded.factions) {
  if (values.faction && !faction.name.toLowerCase().includes(values.faction.toLowerCase())) continue
  for (const id of loaded.index.datasheets.get(faction.id) ?? []) {
    const sheet = describeDatasheetAbilities(loaded, faction.id, datasheetIn(loaded, faction.id, id), rules)
    for (const ability of sheet?.abilities ?? []) add(ability.name, ability.description, `${faction.name} / ${sheet!.name}`, 'unit')
  }
}
for (const [faction, detachments] of rules.detachmentDetails) {
  for (const detachment of detachments.values()) {
    const source = `${rules.factionNames.get(faction) ?? faction} / ${detachment.name}`
    for (const rule of [...detachment.rules, ...detachment.enhancements, ...detachment.upgrades])
      add(rule.name, rule.description, source, 'detachment')
    for (const rule of detachment.stratagems) add(rule.name, rule.description, source, 'stratagem')
  }
}
for (const stratagem of rules.core)
  add(stratagem.name, rules.coreDetails.find((rule) => rule.id === stratagem.key)?.description ?? null, 'Core', 'stratagem')
const rows = [...entries.values()]
const combat = rows.filter((row) => row.roles.length)
const calculated = combat.filter((row) => row.calculated)
const weaponKeywords = combatWeaponKeywordInventory(loaded, values.faction)
const report = {
  revision: JSON.parse(fs.readFileSync(path.join(directory, 'revision.json'), 'utf8')) as unknown,
  summary: {
    descriptions: rows.length,
    combat: combat.length,
    calculated: calculated.length,
    noDamageEffect: rows.filter((row) => row.status === 'no-damage-effect').length,
    notCalculated: combat.length - calculated.length,
    weaponKeywordVariants: weaponKeywords.length,
    unsupportedWeaponKeywordVariants: weaponKeywords.filter((row) => !row.supported).length,
  },
  weaponKeywords,
  rules: rows.toSorted((left, right) => Number(left.calculated) - Number(right.calculated) || left.name.localeCompare(right.name)),
}
console.log(values.json ? JSON.stringify(report, null, 2) : JSON.stringify(report.summary, null, 2))
