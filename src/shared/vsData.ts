import { z } from 'zod'
import type { RuleSummary } from '../contracts/rules'
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

const countedSchema = z.array(z.tuple([z.string(), z.number().int()]))
const selectorsSchema = z.object({ selectors: z.array(z.string()) })

/**
 * What a datasheet shows of a unit from VS Data's roster definitions and transport facts, with models and wargear
 * named: its models and how many of each, what each carries, the options its models take, and what it can carry.
 */
export const vsDataUnitSchema = z.object({
  sizes: z.array(z.number().int()),
  models: z.array(
    z.object({
      name: z.string(),
      min: z.number().int(),
      max: z.number().int(),
      wargear: countedSchema,
    }),
  ),
  options: z.array(
    z.object({
      carrier: z.string().optional(),
      perModels: z.number().int().optional(),
      choose: z.object({ min: z.number().int(), max: z.number().int() }),
      choices: z.array(z.string()),
      replaces: countedSchema.optional(),
      caps: z.array(z.object({ choices: z.array(z.string()), max: z.number().int(), perModels: z.number().int().optional() })).optional(),
    }),
  ),
  transport: z
    .object({
      loads: z.array(z.array(z.object({ count: z.string(), limit: z.number().int(), selectors: z.array(z.string()) }))).optional(),
      excluded: z.array(selectorsSchema).optional(),
      space: z.array(selectorsSchema.partial().extend({ size: z.number().int() })).optional(),
      firingDeck: z.number().int().optional(),
    })
    .optional(),
})
export type VsDataUnit = z.infer<typeof vsDataUnitSchema>
/**
 * What datasheets show from VS Data for one rules version: each unit's roster and transport data with its VS Data id, by
 * its BSData entry id, and every ability's summary by VS Data id, which starts with its unit's or its faction's.
 */
export type VsDataUnits = {
  units: Record<string, VsDataUnit & { id: string }>
  abilities: Record<string, RuleSummary>
  /** The VS Data id of each ability aliased to a BSData profile, by that profile's id. */
  aliases: Record<string, string>
}

/**
 * What the snapshot keeps of a verified VS Data release: each summary with its spans and open questions, the aliases
 * of every entry a summary is for or links to, and the upstream work its records adapt, which must be credited.
 */
export const vsDataSummariesSchema = z.object({
  release: z.string(),
  rulesVersion: rulesVersionSchema,
  entries: z.record(z.string(), z.array(z.string())),
  attributions: z.array(vsDataAttributionSchema).default([]),
  /** Each unit's datasheet data by VS Data id; its BSData aliases are in `entries` under `unit:<id>`. */
  units: z.record(z.string(), vsDataUnitSchema).default({}),
  records: z.array(
    refSchema.extend({
      summary: z.string().min(1),
      // Spans are VS Data's markup before its Markdown; a Markdown release has none.
      spans: z.array(spanSchema).default([]),
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
  | 'core rule clarification'
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
        for (const component of list(container.components)) {
          const code = component.type === 'accordion' ? clarificationTitle(english(component.title) ?? '').code : null
          if (code)
            add(
              'core rule clarification',
              `gdc.core.rule.clarification.${dotted(container.id)}.${dotted(code)}`,
              [raw(component.text)],
              clarificationEntry(String(container.id), code),
            )
        }
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

/** A core rule clarification's number and name, from the title the source prints, as "01.04.06 - Drawing a Line". */
export function clarificationTitle(title: string) {
  const [, code, name] = /^(\d+(?:\.\d+)+)\s*[-–—]\s*(.+)$/.exec(title) ?? []
  return { code: code ?? null, name: name ?? title }
}

/** How a core rule clarification is named among a rules document's entries: its rule's id and its own number. */
export const clarificationEntry = (rule: string, code: string) => `${rule}#${code}`

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
