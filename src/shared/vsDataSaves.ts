import type { RuleSummary } from '../contracts/rules'
import type { Datasheet } from '../core/datasheet'
import { datasheetCharacteristicKind, datasheetProfileKind } from '../core/datasheetStructure'
import type { CombatRule, CombatRuleChoice } from '../core/combatRules'
import type { VsDataInvulnerableSave, VsDataUnits } from './vsData'

type Member = { selected: Datasheet; rules: CombatRule[] }

const VS_DATA_SAVE = 'vs-data-invulnerable:'
const isInvulnerable = (name: string) => datasheetCharacteristicKind(name) === 'invulnerable-save'

/** A summary's words alone, as a label: VS Data's own wording, never a source's. */
export const summaryWords = (summary: RuleSummary) =>
  summary.blocks
    .flatMap((block) => ('paragraph' in block ? [block.paragraph] : block.items))
    .map((runs) => runs.map((run) => run.text).join(''))
    .join(' ')

/** The rule a save that holds only against some attacks, or only under a condition, is in combat. */
function saveRule(sheet: Datasheet, save: VsDataInvulnerableSave): CombatRule {
  const phases = save.against ? [save.against] : (['ranged', 'melee'] as const)
  const scope = save.against ? `Against ${save.against} attacks` : 'Against every attack'
  const label = save.conditional && save.summary ? summaryWords(save.summary) : scope
  const choices: CombatRuleChoice[] = [{ label, effects: [{ role: 'defender', phases: [...phases], invulnerable: save.roll }] }]
  // A selection counts from 1, 0 leaving the rule off, as a conditional save is until a player turns it on.
  const defaultChoice = save.conditional ? 0 : 1
  return {
    id: `${VS_DATA_SAVE}${save.profile}:${save.against ?? ''}`,
    name: `Invulnerable save ${save.roll}+`,
    source: sheet.name,
    description: label,
    scope: 'unit',
    reading: { compiled: { choices, defaultChoice }, legacy: choices, legacyDefault: defaultChoice, roles: ['defender'] },
  }
}

function withSaves<T extends Member>(member: T, saves: readonly VsDataInvulnerableSave[] | undefined): T {
  if (!saves?.length || member.rules.some((rule) => rule.id.startsWith(VS_DATA_SAVE))) return member
  const always = saves.filter((save) => !save.against && !save.conditional)
  const unitProfiles = member.selected.profiles.filter((profile) => datasheetProfileKind(profile.type) === 'unit')
  // A model's own save is on its profile, so Ibram Gaunt's protects his wounds and not his Ghosts'.
  const savedBy = (name: string) =>
    always.find((save) => save.model === name) ?? (unitProfiles.length === 1 ? always[0] : always.find((save) => !save.model))
  const selected: Datasheet = {
    ...member.selected,
    profiles: member.selected.profiles.map((profile) => {
      if (datasheetProfileKind(profile.type) !== 'unit') return profile
      const save = savedBy(profile.name)
      // A save the roster grants, as an enhancement does, stays as the catalogue projects it.
      const projected = profile.values.find((value) => isInvulnerable(value.name) && value.modifiers?.length)
      if (projected) return profile
      const values = profile.values.filter((value) => !isInvulnerable(value.name))
      return { ...profile, values: save ? [...values, { name: 'InSv', value: `${save.roll}+` }] : values }
    }),
  }
  const ruled = saves.filter((save) => save.against || save.conditional)
  return {
    ...member,
    selected,
    // VS Data's typed saves stand for the catalogue's written ones, so a save is not counted twice.
    rules: [
      ...member.rules.filter((rule) => !/\binvulnerable save\b/i.test(rule.name)),
      ...ruled.map((save) => saveRule(member.selected, save)),
    ],
  }
}

/**
 * A combatant whose invulnerable saves are VS Data's typed ones wherever VS Data has the unit's: a model's own on its
 * profile, one against only ranged or melee attacks as a rule for that phase, and a conditional one as an option off
 * until a player turns it on. The catalogue's figure stays where VS Data has none. Applying it twice changes nothing.
 */
export function withVsDataSaves<T extends Member & { companions: Member[] }>(combatant: T, units: VsDataUnits | null | undefined): T {
  if (!units) return combatant
  const savesOf = (sheet: Datasheet) => units.units[sheet.id]?.invulnerableSaves
  return {
    ...withSaves(combatant, savesOf(combatant.selected)),
    companions: combatant.companions.map((member) => withSaves(member, savesOf(member.selected))),
  }
}
