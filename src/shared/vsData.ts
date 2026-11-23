import { z } from 'zod'
import { english } from './datacards'

const refSchema = z.object({ kind: z.string().min(1), id: z.string().min(1) })
export type VsDataRef = z.infer<typeof refSchema>

const rulesVersionSchema = z.object({ edition: z.string().min(1), update: z.string().min(1) })
export type VsDataRulesVersion = z.infer<typeof rulesVersionSchema>

/** A VS Data identity release: every entry of one rules version, with the other IDs that resolve to it. */
export const vsDataIdentitySchema = z.object({
  rulesVersion: rulesVersionSchema,
  entries: z.array(
    refSchema.extend({
      name: z.string(),
      aliases: z.array(z.string()).optional(),
      retired: z.unknown().optional(),
    }),
  ),
})
export type VsDataIdentity = z.infer<typeof vsDataIdentitySchema>

/** One summary record, as a `rules-reference` or `mission-rules` category publishes it. */
export const vsDataRecordSchema = refSchema.extend({
  rulesVersion: rulesVersionSchema,
  data: z.object({
    summary: z.string().min(1),
    summarySpans: z
      .array(z.object({ start: z.number().int(), end: z.number().int(), bold: z.literal(true).optional(), target: refSchema.optional() }))
      .optional(),
    citations: z.array(
      z.discriminatedUnion('type', [
        z.object({ type: z.literal('app'), title: z.string() }),
        z.object({ type: z.literal('publisher'), title: z.string(), url: z.string(), page: z.string().optional() }),
      ]),
    ),
    interpretation: z.array(z.object({ question: z.string() })).optional(),
  }),
})
export type VsDataRecord = z.infer<typeof vsDataRecordSchema>

export const vsDataKey = ({ kind, id }: VsDataRef) => `${kind}:${id}`

/**
 * The Praetorium rules version a VS Data release describes: `MFM 1.6` is `mfm-1-6`. Only that version's
 * cards print the rules its summaries describe, so no other version shows them.
 */
export function vsDataEdition(rulesVersion: VsDataRulesVersion) {
  const [, major, minor] = /^MFM (\d+)\.(\d+)$/.exec(rulesVersion.update) ?? []
  return rulesVersion.edition === '11th' && major ? `mfm-${major}-${minor}` : null
}

/** Active entries by every ID that names them: their own `kind:id` and each alias. */
export function vsDataIndex(identity: VsDataIdentity) {
  const entries = new Map<string, VsDataRef>()
  const aliases = new Map<string, string[]>()
  for (const { kind, id, aliases: names = [], retired } of identity.entries) {
    if (retired) continue
    const ref = { kind, id }
    entries.set(vsDataKey(ref), ref)
    for (const alias of names) entries.set(alias, ref)
    aliases.set(vsDataKey(ref), names)
  }
  return {
    entry: (key: string) => entries.get(key),
    aliasesOf: (ref: VsDataRef) => aliases.get(vsDataKey(ref)) ?? [],
  }
}

/** The kinds of Game Datacards record VS Data summarizes, as the coverage report counts them. */
export type GdcRuleKind =
  | 'stratagem'
  | 'core stratagem'
  | 'enhancement'
  | 'FAQ'
  | 'army rule'
  | 'detachment rule'
  | 'unit ability'
  | 'keyword'
  | 'core rule'
  | 'mission card'
  | 'mission award'
  | 'mission action'
  | 'mission twist'

/**
 * A Game Datacards record by the key VS Data names it with, and the strings it prints its rule in: the
 * strings a rules-text token can name. `key` is an identity alias, or `kind:id` where VS Data keys the
 * record by the source's own name, as it does keywords. `entry` is the rules-document entry a core rule is.
 */
export type GdcRuleRecord = { kind: GdcRuleKind; key: string; texts: string[]; entry?: string }

/**
 * VS Data's alias grammar for Game Datacards records: `gdc.` and the record's kind, then its UUID with
 * dots for dashes, then for a rule a card prints by name, that name in lower case with dots between its
 * words. Core rules are aliased by the source's own entry UUID.
 */
export function gdcRuleRecords(file: unknown): GdcRuleRecord[] {
  const root = fieldsOf(file)
  if (!root) return []
  const records: GdcRuleRecord[] = []
  const add = (kind: GdcRuleKind, key: string, texts: (string | null)[], entry?: string) =>
    records.push({ kind, key, texts: texts.filter((text): text is string => Boolean(text)), ...(entry ? { entry } : {}) })
  for (const stratagem of list(root.stratagems)) {
    const core = stratagem.type === 'Core Stratagem'
    const texts = ['when', 'target', 'effect', 'restrictions'].map((field) => raw(stratagem[field]))
    add(core ? 'core stratagem' : 'stratagem', `gdc.${core ? 'core.stratagem' : 'stratagem'}.${dotted(stratagem.id)}`, texts)
  }
  for (const enhancement of list(root.enhancements))
    add('enhancement', `gdc.enhancement.${dotted(enhancement.id)}`, [raw(enhancement.description)])
  for (const faq of list(root.faqs)) add('FAQ', `gdc.faq.${dotted(faq.id)}`, [raw(faq.errataText)])
  const rules = fieldsOf(root.rules)
  for (const rule of list(rules?.army)) add('army rule', `gdc.army.rule.army.${named(rule.name)}`, blockTexts(rule.rules))
  for (const detachment of list(rules?.detachment))
    for (const rule of list(detachment.rules))
      add('detachment rule', `gdc.detachment.rule.${dotted(detachment.detachment_id)}.${named(rule.name)}`, blockTexts(rule.rules))
  for (const datasheet of list(root.datasheets))
    for (const ability of list(fieldsOf(datasheet.abilities)?.other))
      add('unit ability', `gdc.unit.ability.${dotted(datasheet.id)}.${named(ability.name)}`, [raw(ability.description)])
  for (const keyword of list(root.keywords)) {
    const kind = Array.isArray(keyword.appliesTo) && keyword.appliesTo.includes('weapons') ? 'weapon-ability' : 'core-ability'
    add('keyword', `${kind}:${String(keyword.key)}`, [raw(keyword.description)])
  }
  if (root.cardType === 'coreRules')
    for (const section of list(root.sections))
      for (const container of list(section.containers)) {
        const fields = [container.stratagem, container.behaviour].flatMap((value) => Object.values(fieldsOf(value) ?? {}))
        add('core rule', String(container.id), [...blockTexts(container.components), ...fields.map(raw)], String(container.id))
      }
  for (const mission of [...list(root.primaryMissions), ...list(root.secondaryMissions)]) {
    add('mission card', `gdc.mission.card.text.${dotted(mission.id)}`, [raw(mission.description)])
    list(mission.objectives).forEach((objective, at) =>
      list(objective.scoring).forEach((scoring, step) =>
        add('mission award', `gdc.mission.award.${dotted(mission.id)}.o${at + 1}.s${step + 1}`, [raw(scoring.scoringCriteria)]),
      ),
    )
    list(mission.actions).forEach((action, at) =>
      add(
        'mission action',
        `gdc.mission.action.${dotted(mission.id)}.a${at + 1}`,
        ['unitsText', 'startsText', 'completesText', 'effectText', 'useLimitText'].map((field) => raw(action[field])),
      ),
    )
  }
  for (const twist of list(root.missionTwists)) add('mission twist', `gdc.mission.twist.${dotted(twist.id)}`, [raw(twist.rules)])
  return records
}

const dotted = (id: unknown) => String(id).replaceAll('-', '.')
const named = (name: unknown) =>
  (english(name) ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join('.')
/** A printed string exactly as the file holds it, which is what a token's hash is taken of. */
const raw = (value: unknown) => {
  const text = typeof value === 'string' ? value : fieldsOf(value)?.en
  return typeof text === 'string' && text.trim() ? text : null
}
const blockTexts = (blocks: unknown) => list(blocks).map((block) => raw(block.text))
const fieldsOf = (value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
const list = (value: unknown) =>
  (Array.isArray(value) ? value : []).flatMap((entry: unknown) => {
    const fields = fieldsOf(entry)
    return fields ? [fields] : []
  })
