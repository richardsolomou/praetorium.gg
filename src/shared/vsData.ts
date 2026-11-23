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

const phaseSchema = z.enum(['command', 'movement', 'shooting', 'charge', 'fight'])
const turnSchema = z.enum(['own', 'opponent', 'any'])

/**
 * A Stratagem's typed facts as the snapshot keeps them: its record's CP, phases, turn and type, the limit its facts
 * type, and the Detachment it belongs to by name, or null for a core Stratagem.
 */
export const vsDataStratagemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  detachment: z.string().min(1).nullable(),
  cp: z.number().int().min(0),
  phases: z.array(phaseSchema).min(1),
  turn: turnSchema,
  type: z.enum(['battle-tactic', 'strategic-ploy', 'epic-deed', 'wargear']).nullable(),
  limit: z.enum(['phase', 'turn', 'battle-round', 'battle']).nullable(),
})
export type VsDataStratagem = z.infer<typeof vsDataStratagemSchema>

/** A part of a mission pack VS Data has not typed yet. */
const unresolvedSchema = z.object({ unresolved: z.string() })
const orUnresolved = <T extends z.ZodType>(schema: T) => z.union([schema, unresolvedSchema])
const roundsSchema = z.object({ from: z.number().int().optional(), to: z.number().int().optional() })
const windowSchema = z.union([
  z.object({
    at: z.literal('phase-end'),
    phase: phaseSchema,
    turn: turnSchema,
    rounds: roundsSchema.optional(),
    orBattleEnd: z.literal(true).optional(),
  }),
  z.object({ at: z.literal('turn-end'), turn: turnSchema, rounds: roundsSchema.optional(), orBattleEnd: z.literal(true).optional() }),
  z.object({ at: z.literal('battle-end') }),
])
const modeSchema = z.enum(['fixed', 'tactical'])
const awardSchema = z.object({
  id: z.string(),
  vp: z.number().int(),
  count: z.enum(['once', 'each']),
  max: z.number().int().optional(),
  modes: z.array(modeSchema).optional(),
  exclusive: z.string().optional(),
  criterion: orUnresolved(z.object({ summary: z.string() })),
  windows: z.array(orUnresolved(windowSchema)),
})
const capSchema = orUnresolved(z.object({ perRound: z.number().int().optional(), perBattle: z.number().int().optional() }))
const memberSchema = z.object({ id: z.string(), name: z.string(), aliases: z.array(z.string()).default([]) })

/** A VS Data mission pack, format 1: what a player decides and scores in one pack. */
export const vsDataMissionPackSchema = z.object({
  formatVersion: z.literal(1),
  id: z.string(),
  name: z.string(),
  caps: z.object({ primary: capSchema, secondary: capSchema, fixedSecondaryPerCard: capSchema }),
  dispositions: z.array(memberSchema),
  deployments: z.array(memberSchema),
  layouts: z.array(memberSchema.extend({ deployments: z.array(z.string()) })),
  primaries: z.array(
    memberSchema.extend({
      pairings: z.array(
        z.object({ friendly: z.string(), opposition: z.string(), deployments: z.array(z.string()), layouts: z.array(z.string()) }),
      ),
      awards: z.array(awardSchema),
    }),
  ),
  secondaries: z.array(
    memberSchema.extend({
      modes: z.array(modeSchema),
      awards: z.array(awardSchema),
      whenDrawn: orUnresolved(
        z.object({
          action: z.literal('redraw'),
          required: z.boolean(),
          untilRound: z.number().int().optional(),
          ifActive: z.string().optional(),
        }),
      ).optional(),
    }),
  ),
  twists: z.array(memberSchema.extend({ changesPrimary: z.boolean() })),
})
export type VsDataMissionPack = z.infer<typeof vsDataMissionPackSchema>
export type VsDataAward = z.infer<typeof awardSchema>
export type VsDataWindow = z.infer<typeof windowSchema>

export const isUnresolved = (value: unknown): value is { unresolved: string } =>
  Boolean(value && typeof value === 'object' && 'unresolved' in value)

/**
 * What the snapshot keeps of a verified VS Data release: each summary with its spans and open questions, the aliases
 * of every entry a summary is for or links to, the upstream work its records adapt, which must be credited, and the
 * typed Stratagems and mission packs the battle rules read.
 */
export const vsDataSummariesSchema = z.object({
  release: z.string(),
  rulesVersion: rulesVersionSchema,
  entries: z.record(z.string(), z.array(z.string())),
  attributions: z.array(vsDataAttributionSchema).default([]),
  stratagems: z.array(vsDataStratagemSchema).default([]),
  missionPacks: z.array(vsDataMissionPackSchema).default([]),
  /** The mission actions the packs' cards name, each under the ID of the card it extends. */
  missionActions: z.array(z.object({ id: z.string(), name: z.string() })).default([]),
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
