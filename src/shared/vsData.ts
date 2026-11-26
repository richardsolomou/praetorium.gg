import { z } from 'zod'
import type { RuleSummary } from '../contracts/rules'
import { english, gdcAliasName as named, gdcAliasId as dotted, gdcDetachmentRuleAlias, gdcEnhancementAlias } from './datacards'

/** The credit a record Praetorium serves from VS Data alone carries. */
export const VS_DATA_ATTRIBUTION = 'Rules data from VS Data'

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
/** A Stratagem can also be used as a turn ends, which no mission scores at as a phase. */
const stratagemPhaseSchema = z.enum([...phaseSchema.options, 'end-of-turn'])

/**
 * A Stratagem's typed facts as the snapshot keeps them: its record's CP, phases, turn and type, the windows that pair a
 * phase with its own turn where its phases' turns differ, the limit its facts type, and the Detachment it belongs to
 * by name, or null for a core Stratagem.
 */
export const vsDataDetachmentSchema = z.object({
  name: z.string().min(1),
  /** Set where the rules version's build has no such Detachment, though another source prints it. */
  absent: z.literal(true).optional(),
  stratagems: z.array(z.string()),
  stratagemsUnlisted: z.array(z.string()),
  enhancements: z.array(z.string()),
  enhancementsUnlisted: z.array(z.string()),
})
export type VsDataDetachment = z.infer<typeof vsDataDetachmentSchema>

export const vsDataStratagemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  detachment: z.string().min(1).nullable(),
  cp: z.number().int().min(0),
  phases: z.array(stratagemPhaseSchema).min(1),
  turn: turnSchema,
  windows: z.array(z.object({ phase: stratagemPhaseSchema, turn: turnSchema })).optional(),
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
      pairings: z
        .array(z.object({ friendly: z.string(), opposition: z.string(), deployments: z.array(z.string()), layouts: z.array(z.string()) }))
        .default([]),
      awards: z.array(awardSchema),
    }),
  ),
  secondaries: z.array(
    memberSchema.extend({
      modes: z.array(modeSchema),
      awards: z.array(awardSchema),
      whenDrawn: orUnresolved(
        z.object({
          action: z.enum(['redraw', 'discard']),
          required: z.boolean(),
          untilRound: z.number().int().optional(),
          ifActive: z.string().optional(),
          ifNoEnemy: z
            .object({ entity: z.enum(['model', 'unit']), characteristic: z.enum(['wounds', 'starting-strength']), min: z.number().int() })
            .optional(),
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
const countedSchema = z.array(z.tuple([z.string(), z.number().int()]))
const selectorsSchema = z.object({ selectors: z.array(z.string()) })

const plainBaseSchema = z.union([
  z.enum(['hull', 'unique']),
  z.object({ diameter: z.number(), approximate: z.literal(true).optional(), flying: z.literal(true).optional() }),
  z.object({ length: z.number(), width: z.number(), approximate: z.literal(true).optional(), flying: z.literal(true).optional() }),
  z.object({ flyingBase: z.enum(['large', 'small']) }),
])
const singleBaseSchema = z.union([plainBaseSchema, z.object({ alternatives: z.array(plainBaseSchema).min(1) })])
/**
 * A base VS Data types, with models and wargear by name: one size, sizes it leaves to the player, a size for each of a
 * profile's models, or a size the model takes with some wargear in place of its own.
 */
const equippedBaseSchema = z.union([
  singleBaseSchema,
  z.object({ size: singleBaseSchema, withWargear: z.array(z.object({ wargear: z.array(z.string()), size: singleBaseSchema })).min(1) }),
])
export const vsDataBaseSizeSchema = z.union([
  equippedBaseSchema,
  z.object({ byModel: z.array(z.object({ models: z.array(z.string()), size: equippedBaseSchema })).min(1) }),
])
export type VsDataBaseSize = z.infer<typeof vsDataBaseSizeSchema>
export type VsDataSingleBase = z.infer<typeof singleBaseSchema>
export type VsDataEquippedBase = z.infer<typeof equippedBaseSchema>

/**
 * What a datasheet shows of a unit from VS Data's roster definitions and transport facts, with models and wargear
 * named: its models and how many of each, what each carries, the options its models take, and what it can carry.
 */
export const vsDataUnitSchema = z.object({
  sizes: z.array(z.number().int()),
  /** The `shared.*` abilities VS Data publishes once for several units, this one among them. */
  shared: z.array(z.string()).optional(),
  /** How many of each model the unit starts with, where that is not its smallest size. */
  defaultModels: countedSchema.optional(),
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
      /** How many of the carrier's models take each choice before any change, where the models' defaults differ. */
      defaults: countedSchema.optional(),
    }),
  ),
  /**
   * Each invulnerable save the unit's profiles print: a model's own where it is not the unit's, the attacks it is only
   * against, and whether a condition, summarized in the release's `unit-profile` record of `profile`, limits it.
   */
  invulnerableSaves: z
    .array(
      z.object({
        profile: z.string(),
        model: z.string().optional(),
        roll: z.number().int(),
        against: z.enum(['ranged', 'melee']).optional(),
        conditional: z.literal(true).optional(),
        /** The `unit-profile` record summarizing its condition. */
        condition: z.string().optional(),
      }),
    )
    .optional(),
  /**
   * Each stat line's base, with the models it names where the unit has several, or null where no official source prints
   * one, as for most Warhammer Legends datasheets.
   */
  bases: z.array(z.object({ models: z.array(z.string()).optional(), size: vsDataBaseSizeSchema.nullable() })).optional(),
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
export type VsDataInvulnerableSave = NonNullable<VsDataUnit['invulnerableSaves']>[number] & { summary?: RuleSummary }
export type VsDataUnits = {
  units: Record<string, Omit<VsDataUnit, 'invulnerableSaves'> & { id: string; invulnerableSaves?: VsDataInvulnerableSave[] }>
  abilities: Record<string, RuleSummary>
  /** The VS Data id of each ability aliased to a BSData profile, by that profile's id. */
  aliases: Record<string, string>
  /** The VS Data id of each faction whose name's slug is no faction's id, by that slug, as Adeptus Titanicus is `titan-legions`. */
  factions?: Record<string, string>
}

/** Each name's spellings, its English one first. */
const spellingsSchema = z.array(z.array(z.string()))
export const vsDataNamesSchema = z.object({
  factions: spellingsSchema,
  /** Every Detachment's spellings by VS Data id, its English name alone where no language spells it otherwise. */
  detachments: z.record(z.string(), z.array(z.string())),
  enhancements: spellingsSchema,
  dispositions: spellingsSchema.default([]),
  /** Every unit's spellings, and those of each model and piece of wargear it holds, by VS Data id. */
  units: z.record(z.string(), z.object({ name: z.array(z.string()), pieces: spellingsSchema })),
})
export type VsDataNames = z.infer<typeof vsDataNamesSchema>

/**
 * A rule of a rules document, as VS Data outlines the core rules, Chapter Approved and the other documents: where it reads
 * in its document, under which section, its printed number, and the stable address a page links it by. A clarification
 * the document numbers beneath a rule names that rule as `parent`; a rule that prints a core Stratagem names it.
 */
export const vsDataCoreRuleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  document: z.string().min(1),
  section: z.string().nullable(),
  number: z.string().nullable(),
  parent: z.string().nullable(),
  order: z.number().int(),
  anchor: z.string().min(1),
  stratagem: z.string().nullable(),
})
export type VsDataCoreRule = z.infer<typeof vsDataCoreRuleSchema>

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
  /**
   * Each Detachment of the rules version, by name, with the Stratagems and Enhancements its build prints: the ones the
   * release publishes by ID, and by name the printed ones it does not.
   */
  detachments: z.array(vsDataDetachmentSchema).default([]),
  /** Each datasheet and ability profile, by BSData ids, the rules version does not print though BSData gives it. */
  absentAbilities: z.array(z.tuple([z.string(), z.string()])).optional(),
  absentAbilityNames: z.array(z.tuple([z.string(), z.string()])).optional(),
  absentDetachmentRules: z.array(z.tuple([z.string(), z.string()])).optional(),
  /** Each unit's datasheet data by VS Data id; its BSData aliases are in `entries` under `unit:<id>`. */
  units: z.record(z.string(), vsDataUnitSchema).default({}),
  /** Each faction's VS Data id by its name. */
  factions: z.record(z.string(), z.string()).default({}),
  /** Every spelling the official app gives each name in any language, which imports read lists by. */
  // A snapshot compacted in an earlier shape reads as having no names rather than no release.
  names: vsDataNamesSchema.optional().catch(undefined),
  /** The name of each weapon and core ability, the keywords a datasheet prints, by `kind:id`. */
  keywords: z.record(z.string(), z.string()).default({}),
  /** Every rule of the rules documents, in no particular order. */
  coreRules: z.array(vsDataCoreRuleSchema).default([]),
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
  for (const enhancement of list(root.enhancements)) add('enhancement', gdcEnhancementAlias(enhancement.id), [raw(enhancement.description)])
  for (const faq of list(root.faqs)) add('FAQ', `gdc.faq.${dotted(faq.id)}`, [raw(faq.errataText)])
  const rules = fieldsOf(root.rules)
  for (const rule of list(rules?.army)) add('army rule', `gdc.army.rule.army.${named(rule.name)}`, blockTexts(rule.rules))
  for (const detachment of list(rules?.detachment))
    for (const rule of list(detachment.rules))
      add('detachment rule', gdcDetachmentRuleAlias(detachment.detachment_id, rule.name), blockTexts(rule.rules))
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
