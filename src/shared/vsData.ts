import { z } from 'zod'
import { english } from './datacards'

const refSchema = z.object({ kind: z.string().min(1), id: z.string().min(1) })
export type VsDataRef = z.infer<typeof refSchema>

const rulesVersionSchema = z.object({ edition: z.string().min(1), update: z.string().min(1) })
export type VsDataRulesVersion = z.infer<typeof rulesVersionSchema>

export const vsDataAttributionSchema = z.object({ credit: z.string(), url: z.string(), licence: z.string() })
export type VsDataAttribution = z.infer<typeof vsDataAttributionSchema>

const spanSchema = z.object({
  start: z.number().int(),
  end: z.number().int(),
  bold: z.literal(true).optional(),
  target: refSchema.optional(),
})
export type VsDataSpan = z.infer<typeof spanSchema>

/**
 * What the snapshot keeps of a verified VS Data release: each summary with its spans and open questions, the aliases
 * of every entry a summary is for or links to, and the upstream work its records adapt, which must be credited.
 */
export const vsDataSummariesSchema = z.object({
  release: z.string(),
  rulesVersion: rulesVersionSchema,
  entries: z.record(z.string(), z.array(z.string())),
  attributions: z.array(vsDataAttributionSchema).default([]),
  records: z.array(
    refSchema.extend({
      summary: z.string().min(1),
      spans: z.array(spanSchema),
      questions: z.array(z.string()),
    }),
  ),
})
export type VsDataSummariesFile = z.infer<typeof vsDataSummariesSchema>

export const vsDataKey = ({ kind, id }: VsDataRef) => `${kind}:${id}`

/**
 * The Praetorium rules version a VS Data release describes, which VS Data names as Praetorium does: only that
 * version's cards print the rules its summaries describe, so no other version shows them.
 */
export function vsDataEdition(rulesVersion: VsDataRulesVersion, editions: readonly { id: string; name: string }[]) {
  return rulesVersion.edition === '11th' ? (editions.find((edition) => edition.name === rulesVersion.update)?.id ?? null) : null
}

/** Entries by every ID that names them: their own `kind:id` and each alias. */
export function vsDataIndex(entries: Readonly<Record<string, readonly string[]>>) {
  const byName = new Map<string, VsDataRef>()
  for (const [key, aliases] of Object.entries(entries)) {
    const at = key.indexOf(':')
    const ref = { kind: key.slice(0, at), id: key.slice(at + 1) }
    byName.set(key, ref)
    for (const alias of aliases) byName.set(alias, ref)
  }
  return {
    /** The entry the first of these names that VS Data knows resolves to. */
    entry: (names: readonly string[]) => names.map((name) => byName.get(name)).find(Boolean),
    aliasesOf: (ref: VsDataRef) => entries[vsDataKey(ref)] ?? [],
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
 * A Game Datacards record by the keys VS Data may name it with, most specific first, and the strings it prints its
 * rule in: the strings a rules-text token can name. A key is an identity alias, or `kind:id` where VS Data keys the
 * record by the source's own name, as it does keywords. `entry` is the rules-document entry a core rule is.
 */
export type GdcRuleRecord = { kind: GdcRuleKind; keys: string[]; texts: string[]; entry?: string }

/**
 * VS Data's alias grammar for Game Datacards records: `gdc.` and the record's kind, then its UUID with
 * dots for dashes, then for a rule a card prints by name, that name in lower case with dots between its
 * words. A datasheet several factions print names each faction's copy of an ability with `.faction.` and
 * the faction's UUID, and a wargear ability that shares another ability's name with `.slot.wargear` before
 * that. Core rules are aliased by the source's own entry UUID.
 */
export function gdcRuleRecords(file: unknown): GdcRuleRecord[] {
  const root = fieldsOf(file)
  if (!root) return []
  const records: GdcRuleRecord[] = []
  const add = (kind: GdcRuleKind, keys: string | string[], texts: (string | null)[], entry?: string) =>
    records.push({
      kind,
      keys: typeof keys === 'string' ? [keys] : keys,
      texts: texts.filter((text): text is string => Boolean(text)),
      ...(entry ? { entry } : {}),
    })
  // The core stratagems' file is no faction's, and every stratagem in it is core, whichever type it is.
  const coreFile = typeof root.id !== 'string'
  for (const stratagem of list(root.stratagems)) {
    const core = coreFile
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
  for (const datasheet of list(root.datasheets)) {
    const abilities = fieldsOf(datasheet.abilities)
    const faction = datasheet.faction_id ? `.faction.${dotted(datasheet.faction_id)}` : ''
    // Wargear and special abilities are a datasheet's abilities too, aliased alike.
    for (const group of ['other', 'wargear', 'special'])
      for (const ability of list(abilities?.[group])) {
        const base = `gdc.unit.ability.${dotted(datasheet.id)}.${named(ability.name)}`
        const slotted = group === 'wargear' ? [`${base}.slot.wargear${faction}`, `${base}.slot.wargear`] : []
        add('unit ability', [...slotted, `${base}${faction}`, base], [raw(ability.description)])
      }
  }
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
