import path from 'node:path'
import fs from 'node:fs'
import { parseArgs } from 'node:util'
import { compileCombatRule } from '../src/core/combatRuleCompiler'
import { combatRuleChoices, combatRuleRoles, type CombatRule } from '../src/core/combatRules'
import { datasheetIn } from '../src/server/catalogue'
import { loadCatalogue } from '../src/server/catalogueIndex'
import { describeDatasheetAbilities } from '../src/server/datasheetDescriptions'
import { loadRules } from '../src/server/rules'
import { combatWeaponKeywordInventory, unselectedCombatRules } from './combatRuleInventory'
import type { InventoryRule } from './combatRuleShortlist'

const { values } = parseArgs({ options: { json: { type: 'boolean' }, faction: { type: 'string' } } })
const directory = path.resolve(process.env.CATALOGUE_DIR ?? 'catalogue-data')
const loaded = loadCatalogue(directory)
if (!loaded) throw new Error('Fetch the catalogue snapshot before auditing combat rules.')
const rules = loadRules(path.join(directory, 'rules'), undefined, undefined, undefined, loaded.datacards, loaded.sourceReferences)
if (!rules) throw new Error('The snapshot is missing its rules source.')
const entries = new Map<string, InventoryRule>()
function add(name: string, description: string | null, source: string, scope: CombatRule['scope']) {
  if (!description || (values.faction && !source.toLowerCase().includes(values.faction.toLowerCase()))) return
  const key = JSON.stringify([name, description])
  const existing = entries.get(key)
  if (existing) {
    if (!existing.sources.includes(source)) existing.sources.push(source)
    if (existing.scopes.includes(scope)) return
  }
  const rule: CombatRule = { id: key, name, description, source, scope, models: 1 }
  const compiled = compileCombatRule(rule)
  const choices = combatRuleChoices(rule)
  const roles = compiled
    ? [...new Set(choices.flatMap((choice) => choice.effects.map((effect) => effect.role)))]
    : combatRuleRoles(description)
  const calculated = choices.some((choice) => choice.effects.length)
  const calculatedRoles = [...new Set(choices.flatMap((choice) => choice.effects.map((effect) => effect.role)))]
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
    recognizedWording: calculated.length,
    noDamageEffect: rows.filter((row) => row.status === 'no-damage-effect').length,
    unsupportedWording: combat.length - calculated.length,
    weaponKeywordVariants: weaponKeywords.length,
    unsupportedWeaponKeywordVariants: weaponKeywords.filter((row) => !row.supported).length,
  },
  weaponKeywords,
  rules: rows.toSorted((left, right) => Number(left.calculated) - Number(right.calculated) || left.name.localeCompare(right.name)),
}
console.log(values.json ? JSON.stringify(report, null, 2) : JSON.stringify(report.summary, null, 2))
