import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import type { CombatFacts } from '../src/core/combatReading'
import { ruleAnswers, type RuleQuestion } from '../src/core/combatRuleCompiler'
import { combatTargetAdmits, type CombatReading } from '../src/core/combatRules'
import { routeSlug } from '../src/core/slug'
import { factsKey, type TextFacts, type TextFactsByKey } from '../src/core/textFacts'
import { datasheetIn } from '../src/shared/catalogue'
import { describeDatasheetAbilities } from '../src/shared/datasheetDescriptions'
import { gradeReadingsIn } from '../src/shared/textFacts'
import { snapshotWords } from '../src/server/sourceTexts'
import { completeSteps } from '../src/shared/steps'
import { UNAPPLIED_EFFECT_FIELDS, vsDataEffectsPath, type VsDataEffectsFile } from '../src/shared/vsDataEffects'
import { vsDataSummariesSteps } from '../src/server/vsDataSummaries'
import { type VsDataJoin, vsDataTextFacts } from '../src/server/vsDataEffects'
import { editionDirectory, readCatalogueComposition } from '../src/server/catalogueComposition'
import { loadCatalogue } from '../src/server/catalogueIndex'
import { loadRules } from '../src/server/rules'
import { catalogueDataDirectory } from './lib/catalogueFiles'
import { loadSnapshotWithRules } from './lib/catalogueSnapshotLoad'

/**
 * Compares what Praetorium's rules read from rule wording today (`TextFacts`) with what they would read from VS Data's
 * effect blocks, text by text, for every text the simulator, reminders, roster grades and Order allowances read: each
 * datasheet ability, army rule, Detachment rule, Enhancement, upgrade and Stratagem. A text joins the VS Data record whose
 * summary a datasheet shows for it. Combat compares every placement for every datasheet's keywords, and counts a
 * placement where today's reading calculates an effect and VS Data's does not as a refusal. Report only: it writes the
 * counts and each difference by record, name and field, never rules text.
 *
 * usage: tsx scripts/vsDataEffectsParity.ts [--out <file>] [--only <field>]
 */
const { values } = parseArgs({
  options: { out: { type: 'string' }, only: { type: 'string' }, detail: { type: 'string' }, edition: { type: 'string' } },
})
/** With `--detail <file>`, each changed placement's two readings, to judge which is right; private, as labels may quote. */
const details: unknown[] = []
const directory = path.resolve(catalogueDataDirectory())
const summaries = completeSteps(vsDataSummariesSteps(directory, []))
if (!summaries) throw new Error('the snapshot has no VS Data releases')
const edition = values.edition ?? summaries.editions[0]!
const { catalogue, rules } = loadEdition(edition)

/** Where a rules version's own files are: the snapshot's for the base, its own folder for an earlier one. */
function editionFolder(id: string) {
  const entry = readCatalogueComposition(directory)?.editions.find((candidate) => candidate.edition.id === id)
  return !entry || entry.base ? directory : editionDirectory(directory, entry)
}

/** A rules version's catalogue and rules, as a server loads them: the base from the snapshot, an earlier one from its folder. */
function loadEdition(id: string) {
  const entry = readCatalogueComposition(directory)?.editions.find((candidate) => candidate.edition.id === id)
  if (!entry) throw new Error(`the snapshot has no rules version ${id}`)
  if (entry.base) return loadSnapshotWithRules(directory)
  const target = editionDirectory(directory, entry)
  const loaded = loadCatalogue(target, entry.edition)
  const loadedRules =
    loaded &&
    loadRules(target, {
      battlemasterDirectory: path.join(directory, 'battlemaster'),
      iconDirectory: path.join(directory, 'icons'),
      snapshotDirectory: directory,
      rulesVersion: id,
      catalogue: loaded,
    })
  if (!loaded || !loadedRules) throw new Error(`rules version ${id} has no catalogue data`)
  return { catalogue: loaded, rules: loadedRules }
}
const words = snapshotWords(directory)
// What the rules read from the words today, which the loaded catalogue keeps beside the facts it reads from VS Data.
const wordFacts: TextFactsByKey = { get: (key) => catalogue.definitions!.fact(key) ?? catalogue.datacards.textFacts?.get(key) }
// A rules version VS Data folds into another reads that one's release, as `vsDataSummariesSteps` does.
const release = readCatalogueComposition(directory)?.editions.find((entry) => entry.edition.id === edition)?.summaries ?? edition
const effectsFile = vsDataEffectsPath(path.join(directory, 'summaries', `${release}.json`))
const effects = fs.existsSync(effectsFile) ? (JSON.parse(fs.readFileSync(effectsFile, 'utf8')) as VsDataEffectsFile).effects : {}
const overlay = vsDataTextFacts(
  directory,
  edition,
  path.join(editionFolder(edition), 'datacards', '11th', 'gdc'),
  catalogue.definitions!,
  catalogue.index.datasheets,
)
if (!overlay) throw new Error(`the snapshot keeps no effect blocks for ${edition}`)

/** One text a rule reads, where it is read, and how it joins its record. */
type Read = { place: string; subject: string; name: string; description: string; join: VsDataJoin }
const texts = new Map<string, Read & { places: number }>()

function read(place: string, subject: string, name: string, description: string | null | undefined) {
  if (!description) return
  const key = factsKey(description)
  const found = texts.get(key)
  if (found) return void found.places++
  texts.set(key, { place, subject, name, description, join: overlay!.join(key), places: 1 })
}

const keywordSets = new Map<string, { keywords: string[]; partial: string[] }>()
for (const faction of catalogue.factions)
  for (const id of catalogue.index.datasheets.get(faction.id) ?? []) {
    const sheet = datasheetIn(catalogue, faction.id, id)
    if (!sheet) continue
    const partial = (sheet.modelKeywords ?? []).flatMap((group) => group.keywords)
    keywordSets.set(JSON.stringify([sheet.keywords, partial]), { keywords: sheet.keywords, partial })
    const described = describeDatasheetAbilities(catalogue, faction.id, sheet, rules)
    for (const ability of described?.abilities ?? []) read('sheet', id, ability.name, ability.description)
  }
for (const [faction, army] of rules.factionRules) read('army', `@${faction}`, army.name, army.description)
for (const [faction, detachments] of rules.detachmentDetails)
  for (const detachment of detachments.values()) {
    const subject = `@${faction}.${routeSlug(detachment.name)}`
    for (const rule of [...detachment.rules, ...detachment.enhancements, ...detachment.upgrades])
      read('detachment', subject, rule.name, rule.description)
    for (const stratagem of detachment.stratagems) read('stratagem', subject, stratagem.name, stratagem.description)
  }
for (const stratagem of rules.core)
  read('stratagem', '', stratagem.name, rules.coreDetails.find((detail) => detail.id === stratagem.key)?.description)

// Every other text the catalogue records facts for, as wargear and Enhancements a roster takes, named by what holds it.
for (const key of catalogue.definitions!.facts().keys())
  if (!texts.has(key)) {
    const holder = catalogue.definitions!.holders?.(key)[0]
    texts.set(key, {
      place: 'catalogue',
      subject: holder?.id ?? '',
      name: holder?.name ?? '',
      description: `⟦00000000:${key}⟧`,
      join: overlay.join(key),
      places: 1,
    })
  }

// --- comparison ------------------------------------------------------------------------------------------------------

const lower = (text: string) => text.toLocaleLowerCase('en-GB')
/** A value as behaviour: keyword-like strings without case, labels and empty values left out. */
const canon = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canon)
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key, entry]) => key !== 'label' && entry !== null && entry !== undefined)
        .map(([key, entry]) => [
          key,
          (key === 'recipients' || key === 'exclusions') && typeof entry === 'string'
            ? entry
                .replaceAll(/\^\^|\*\*/g, '')
                .split(/\s+(?:and|or)\s+|\s*,\s*/iu)
                .map(lower)
                .toSorted()
            : canon(entry),
        ])
        .toSorted(([left], [right]) => String(left).localeCompare(String(right))),
    )
  return typeof value === 'string' ? lower(value) : value
}
const same = (left: unknown, right: unknown) => JSON.stringify(canon(left)) === JSON.stringify(canon(right))

const units = [...keywordSets.values()]
function walk(facts: CombatFacts | null | undefined, placement: string, answer: (question: RuleQuestion) => boolean) {
  const nodes = facts?.readings[placement]
  if (!nodes) return null
  let node = nodes[0]!
  while (typeof node !== 'number') node = nodes[answer(node[0]) ? node[1] : node[2]]!
  return facts?.leaves[node] ?? null
}
// Options compared by the order the choices first name them, so an option VS Data names otherwise is the same option.
const byOrder = (choices: readonly { option?: string; label?: string }[]) => {
  const order = new Map<string, number>()
  for (const choice of choices) if (choice.option && !order.has(choice.option)) order.set(choice.option, order.size)
  return choices.map((choice) => ({ ...choice, label: undefined, ...(choice.option ? { option: order.get(choice.option) } : {}) }))
}
const shape = (reading: CombatReading | null) =>
  reading &&
  JSON.stringify(
    canon({
      ...reading,
      compiled: reading.compiled && { ...reading.compiled, choices: byOrder(reading.compiled.choices) },
      shown: reading.shown === undefined ? undefined : reading.shown && { ...reading.shown, choices: byOrder(reading.shown.choices) },
      legacy: byOrder(reading.legacy),
    }),
  )
const calculated = (reading: CombatReading | null) =>
  Boolean(
    reading &&
    (reading.compiled?.choices.some((choice) => choice.effects.length) || reading.legacy.some((choice) => choice.effects.length)),
  )
/** Each distinct set of answers the datasheets' keywords give the questions both readings ask. */
function answerSets(name: string, ...facts: (CombatFacts | null | undefined)[]) {
  const questions = new Set<RuleQuestion>()
  for (const held of facts)
    for (const nodes of Object.values(held?.readings ?? {})) for (const node of nodes) if (Array.isArray(node)) questions.add(node[0])
  const sets = new Map<string, (question: RuleQuestion) => boolean>([['', () => false]])
  for (const unit of units) {
    const answer = ruleAnswers({ keywords: unit.keywords, partialKeywords: unit.partial, name })
    sets.set([...questions].map((question) => (answer(question) ? 1 : 0)).join(''), answer)
  }
  return [...sets.values()]
}
/** The effects a reading calculates, as behaviour: the compiled choices or else the legacy ones, without labels. */
const effectsShape = (reading: CombatReading | null) =>
  !calculated(reading)
    ? null
    : JSON.stringify(
        canon(
          reading!.compiled?.choices.some((choice) => choice.effects.length)
            ? { choices: byOrder(reading!.compiled.choices), default: reading!.compiled.defaultChoice }
            : { choices: byOrder(reading!.legacy), default: reading!.legacyDefault },
        ),
      )

/**
 * How two combat readings compare in the placements a text can be read in (a Stratagem's, or every other): the placements
 * where only today's calculates an effect (refused), only VS Data's does (gained), both do but differently (changed), and
 * whether anything else differs, such as what a datasheet shows or the units a rule admits.
 */
function combatParity(
  today: CombatFacts | null | undefined,
  vs: CombatFacts | null | undefined,
  name: string,
  stratagem: boolean,
  record: string | null = null,
) {
  const result = {
    refused: [] as string[],
    gained: [] as string[],
    changed: [] as string[],
    shown: false,
    judging: false,
    today: undefined as string | null | undefined,
  }
  if (!today && !vs) return result
  const answers = answerSets(name, today, vs)
  const placements = new Set(
    [...Object.keys(today?.readings ?? {}), ...Object.keys(vs?.readings ?? {})].filter(
      (placement) => placement.startsWith('stratagem:') === stratagem,
    ),
  )
  for (const placement of placements)
    for (const answer of answers) {
      const left = walk(today, placement, answer)
      const right = walk(vs, placement, answer)
      const [l, r] = [effectsShape(left), effectsShape(right)]
      const list = l && !r ? result.refused : !l && r ? result.gained : l !== r ? result.changed : null
      if (values.detail && list === result.changed && !list.includes(placement))
        details.push({ record, name, placement, today: JSON.parse(l!), vs: JSON.parse(r!) })
      if (list === result.refused && result.today === undefined) result.today = l
      if (list && !list.includes(placement)) list.push(placement)
      if (shape(left && { ...left, legacy: [], compiled: null }) !== shape(right && { ...right, legacy: [], compiled: null }))
        result.shown = true
    }
  if (today && vs) {
    const judging = (facts: CombatFacts) => ({
      ...facts.judging,
      target: undefined,
      recipientTarget: undefined,
      orders: Boolean(facts.judging.orders),
    })
    const admits = (facts: CombatFacts, keywords: string[]) =>
      JSON.stringify(
        [facts.judging.target, facts.judging.recipientTarget, facts.judging.orders?.target].map((target) =>
          !target ? null : target.allowed[0]?.[0] === '\u0000none' ? false : combatTargetAdmits(target, keywords),
        ),
      )
    result.judging =
      !same(judging(today), judging(vs)) || !units.every((unit) => admits(today, unit.keywords) === admits(vs, unit.keywords))
  } else result.judging = Boolean(today?.judging.orders) !== Boolean(vs?.judging.orders)
  return result
}

/** The fields compared, each read from a text's facts as the rules read them. */
const FIELDS: Record<string, (facts: TextFacts | undefined) => unknown> = {
  combat: (facts) => facts?.combat ?? null,
  reminder: (facts) => (facts?.reminder?.timings.length || facts?.reminder?.whileDestroyed ? facts.reminder : undefined),
  abilityGrants: (facts) => (facts?.abilityGrants?.matched || facts?.abilityGrants?.grants.length ? facts.abilityGrants : undefined),
  normalizedAbilityGrants: (facts) => facts?.normalizedAbilityGrants,
  weaponGrants: (facts) => (facts?.weaponGrants?.length ? facts.weaponGrants : undefined),
  ownWeaponGrant: (facts) => facts?.ownWeaponGrant,
  ledWeaponGrant: (facts) => facts?.ledWeaponGrant,
  invulnerableSave: (facts) => facts?.invulnerableSave,
  bareValue: (facts) => facts?.bareValue,
  linkedWeapon: (facts) => facts?.linkedWeapon,
  unitGeneration: (facts) => facts?.unitGeneration,
  movementTools: (facts) => facts?.movementTools,
  battleChoiceAllowances: (facts) => facts?.battleChoiceAllowances,
  offeredOptions: (facts) => facts?.offeredOptions,
  attachment: (facts) => facts?.attachment,
  substitutes: (facts) => facts?.substitutes,
  reserveSelectors: (facts) => facts?.reserveSelectors,
  reserveExemption: (facts) => facts?.reserveExemption,
  references: (facts) => (facts?.references?.length ? [...new Set(facts.references.map(lower))].toSorted() : undefined),
}

type Difference = {
  field: string
  status: string
  refused?: string[]
  gained?: string[]
  changed?: string[]
  cause?: string
  /** Today's reading in the first refused placement, typed: what VS Data's blocks should give there. */
  today?: string | null
}

/** Why VS Data's reading calculates nothing where today's does, as far as its blocks say. */
function refusalCause(blocks: Readonly<Record<string, unknown>> | undefined) {
  if (!blocks) return 'no effect blocks'
  const combat = blocks.combat as { unresolved?: string } | undefined
  if (!combat) return 'no combat block'
  if (combat.unresolved) return `unresolved: ${combat.unresolved}`
  const json = JSON.stringify(combat)
  const fields = UNAPPLIED_EFFECT_FIELDS.filter((field) => json.includes(`"${field}"`))
  return fields.length ? `unapplied: ${fields.join(', ')}` : 'read otherwise'
}
const counts: Record<string, Record<string, number>> = {}
const bump = (field: string, status: string) => ((counts[field] ??= {})[status] = (counts[field][status] ?? 0) + 1)
const listed: (Omit<Read, 'description'> & { places: number; differences: Difference[] })[] = []
const unapplied: Record<string, number> = {}
const joins: Record<string, number> = {}

for (const text of texts.values()) {
  const recorded = wordFacts.get(factsKey(text.description))
  const record = text.join.record
  // The roster grades read a text's words where its facts record no grade reading, as a card's do not.
  const grades = gradeReadingsIn(text.description, wordFacts, words)
  const today: TextFacts = {
    ...recorded,
    ...(grades.unitGeneration.length ? { unitGeneration: grades.unitGeneration } : { unitGeneration: undefined }),
    ...(grades.movementTools.length ? { movementTools: grades.movementTools } : { movementTools: undefined }),
    combat: recorded?.combat,
  }
  const blocks = record ? effects[record] : undefined
  bump('join', `${text.place}:${text.join.by}${record && !blocks ? ' without effects' : ''}`)
  const vs = overlay.get(factsKey(text.description))
  const differences: Difference[] = []
  for (const [field, of] of Object.entries(FIELDS)) {
    if (values.only && field !== values.only) continue
    const left = of(today)
    const right = of(vs)
    if (field === 'combat') {
      if (!left && !right) continue
      const parity = combatParity(left as CombatFacts | null, right as CombatFacts | null, text.name, text.place === 'stratagem', record)
      const statuses = [
        ...(parity.refused.length ? [record ? 'refuses' : 'refuses:no-record'] : []),
        ...(parity.changed.length ? ['changes'] : []),
        ...(parity.gained.length ? ['gains'] : []),
        ...(parity.judging ? ['judging'] : []),
        ...(parity.shown ? ['shown'] : []),
      ]
      for (const status of statuses.length ? statuses : ['same']) bump(field, status)
      if (statuses.length)
        differences.push({
          field,
          status: statuses.join('+'),
          ...parity,
          ...(parity.refused.length ? { cause: refusalCause(blocks) } : {}),
        })
      continue
    }
    if (left === undefined && right === undefined) continue
    const status = same(left, right)
      ? 'same'
      : !record
        ? 'no-record'
        : left === undefined
          ? 'vs-adds'
          : right === undefined
            ? 'today-only'
            : 'differs'
    bump(field, status)
    if (status !== 'same') differences.push({ field, status })
  }
  if (differences.length) {
    const { description: _, ...shown } = text
    listed.push({ ...shown, differences })
  }
}

if (values.detail) fs.writeFileSync(values.detail, `${JSON.stringify(details, null, 1)}\n`)
const report = { edition, texts: texts.size, unjoinedByPlace: joins, unapplied, counts, listed }
const out = values.out ?? path.resolve('data-dev', 'vs-data-effects-parity.json')
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, `${JSON.stringify(report, null, 1)}\n`)
console.log(JSON.stringify({ edition, texts: texts.size, unjoinedByPlace: joins, unapplied, counts }, null, 1))
console.log(`written to ${out}`)
