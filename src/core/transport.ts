import type { Refusal } from './battle'
import { withoutFactionPrefix } from './name'
import { refuse } from './battlePrimitives'
import { z } from 'zod'
import { matchesKeywordSelector } from './keywords'

/** One allowance a transport prints: how many models it holds, of which keywords, and up to what Wounds. */
type Pool = { capacity: number; carries: string; maxWounds?: number }

/**
 * A printed transport rule read into what the embark checks need.
 *
 * Each load is one way the transport can be filled, and every passenger rides in one
 * of its allowances; most transports print a single load. Keyword lists are kept as
 * the printed selector, so `matchesKeywordSelector` decides what "Adeptus Astartes
 * Infantry" or "Gravis/Terminator" covers.
 */
type TransportRule = {
  loads: Pool[][]
  excluded: { keywords: string; except?: string }[]
  space: { keywords?: string; moreWoundsThan?: number; size: number }[]
}

export type Passenger = {
  name: string
  alive: number
  keywords?: readonly string[]
  wounds?: number
  /** Whose keywords decide whether this passenger may ride, when an ability lets it embark wherever another unit can. */
  ridesAs?: readonly string[]
  /** The space each model takes when an ability fixes it, whatever the transport prints. */
  space?: number
}

export type TransportLoad = (Pool & { used: number })[]

const PHRASE = String.raw`((?:(?!\bmodels?\b)[^,()])+?)`
const CAPACITY = new RegExp(
  String.raw`^This model has a transport capacity of (\d+) ${PHRASE} models?` +
    String.raw`(?: \(excluding ([^()]+?) models?\))?` +
    String.raw`(?: and (\d+) ${PHRASE} models?)?` +
    String.raw`(?:, or (\d+) ${PHRASE} models? with a Wounds characteristic of (\d+) or less)?\.$`,
  'i',
)
const FROM_UNITS = /^This model has a transport capacity of (\d+) models from the following units: ([^.]+)\.?$/i
const CONDITIONAL = new RegExp(
  String.raw`^If this model is equipped with (?:a |an |the )?([^,]+), it has a transport capacity of (\d+) ${PHRASE} models?(?: instead)?\.$`,
  'i',
)
const EXTRA = new RegExp(String.raw`^And (\d+) ${PHRASE} models?\.$`, 'i')
const ALTERNATIVE = new RegExp(String.raw`^Or ${PHRASE} models?\.$`, 'i')
const SPACE =
  /^Each (?:([^.]+?) )?models? (?:with a Wounds characteristic of more than (\d+) )?takes? (?:up )?the space of (\d+) models\.$/i
const CANNOT = /^It cannot transport (.+)\.$/i
const CANNOT_FLY = /^This model cannot transport models that can FLY\.$/i
const EXCLUDED_PIECE = /^(?:the )?(.+?)(?: models?)?(?: \(excluding ([^()]+?) models?\))?$/i
// Sentences about splitting a unit before it embarks say nothing about what fits.
const SETUP = /\bsplit|Declare Battle Formations|One of these units must start/i
// A keyword list that names a condition rather than keywords cannot be checked by keyword.
const UNCHECKABLE = /\b(?:models?|with|that|characteristic)\b/i

const list = (printed: string) => printed.replaceAll('/', ', ')

/**
 * A printed transport rule read sentence by sentence, before any wargear is chosen: the
 * facts a datasheet's text states, kept so the rule can be judged without the text.
 *
 * Null when any sentence says something these checks cannot hold it to, such as a
 * capacity in units or a space that does not say which allowance it fills. A rule the
 * checks only partly understand is not enforced partly.
 */
export type PrintedTransport = {
  main: Pool
  instead: Pool | null
  conditions: (Pool & { wargear: string })[]
  pools: Pool[]
  alternatives: string[]
  excluded: TransportRule['excluded']
  space: TransportRule['space']
}

const printedText = z.string().max(200)
const poolSchema = z.object({
  capacity: z.number().int().positive().max(1_000),
  carries: printedText,
  maxWounds: z.number().int().positive().max(1_000).optional(),
})
/** What a battle log may carry of a transport rule, bounded like any other command input. */
export const printedTransportSchema = z.object({
  main: poolSchema,
  instead: poolSchema.nullable(),
  conditions: z.array(poolSchema.extend({ wargear: printedText })).max(20),
  pools: z.array(poolSchema).max(20),
  alternatives: z.array(printedText).max(20),
  excluded: z.array(z.object({ keywords: printedText, except: printedText.optional() })).max(20),
  space: z
    .array(
      z.object({
        keywords: printedText.optional(),
        moreWoundsThan: z.number().int().nonnegative().max(1_000).optional(),
        size: z.number().int().positive().max(1_000),
      }),
    )
    .max(20),
}) satisfies z.ZodType<PrintedTransport>

export function printedTransport(printed: string | undefined): PrintedTransport | null {
  if (!printed) return null
  let main: Pool | null = null
  let instead: Pool | null = null
  const conditions: (Pool & { wargear: string })[] = []
  const pools: Pool[] = []
  const alternatives: string[] = []
  const excluded: TransportRule['excluded'] = []
  const space: TransportRule['space'] = []
  for (const sentence of printed
    .replaceAll('**', '')
    .split(/(?<=\.)\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean)) {
    let match: RegExpExecArray | null
    if (!main && (match = CAPACITY.exec(sentence))) {
      main = { capacity: Number(match[1]), carries: match[2]! }
      if (match[3]) excluded.push({ keywords: list(match[3]) })
      if (match[4]) pools.push({ capacity: Number(match[4]), carries: match[5]! })
      if (match[6]) instead = { capacity: Number(match[6]), carries: match[7]!, maxWounds: Number(match[8]) }
    } else if (!main && (match = FROM_UNITS.exec(sentence))) {
      main = { capacity: Number(match[1]), carries: match[2]! }
    } else if ((match = CONDITIONAL.exec(sentence))) {
      conditions.push({ wargear: match[1]!, capacity: Number(match[2]), carries: match[3]! })
    } else if ((match = EXTRA.exec(sentence))) {
      pools.push({ capacity: Number(match[1]), carries: match[2]! })
    } else if ((match = ALTERNATIVE.exec(sentence))) {
      alternatives.push(match[1]!)
    } else if ((match = SPACE.exec(sentence)) && !(match[1] && UNCHECKABLE.test(match[1]))) {
      space.push({
        ...(match[1] ? { keywords: list(match[1]) } : {}),
        ...(match[2] ? { moreWoundsThan: Number(match[2]) } : {}),
        size: Number(match[3]),
      })
    } else if (CANNOT_FLY.test(sentence)) {
      excluded.push({ keywords: 'Fly' })
    } else if ((match = CANNOT.exec(sentence))) {
      for (const piece of match[1]!.split(/\s+or\s+(?![^()]*\))/i)) {
        const named = EXCLUDED_PIECE.exec(piece)
        if (!named || UNCHECKABLE.test(named[1]!)) return null
        excluded.push({ keywords: list(named[1]!), ...(named[2] ? { except: list(named[2]) } : {}) })
      }
    } else if (!SETUP.test(sentence)) {
      return null
    }
  }
  return main ? { main, instead, conditions, pools, alternatives, excluded, space } : null
}

/**
 * A transport rule as the checks enforce it for the wargear a model carries, read from
 * the printed text or from what that text was already read into.
 */
export function transportRule(
  printed: string | PrintedTransport | undefined,
  wargear?: readonly { name: string; count: number }[],
): TransportRule | null {
  const read = typeof printed === 'object' ? printed : printedTransport(printed)
  if (!read) return null
  const { main, instead, conditions, pools, alternatives, excluded, space } = read
  if (conditions.length && !wargear) return null
  const selected = conditions.filter((condition) =>
    wargear?.some((piece) => piece.count > 0 && piece.name.toLowerCase() === condition.wargear.replaceAll('*', '').toLowerCase().trim()),
  )
  if (selected.length > 1) return null
  const first = selected[0] ?? main
  const loads = [
    [{ capacity: first.capacity, carries: [first.carries, ...alternatives].join(' or ') }, ...pools],
    ...(instead ? [[instead]] : []),
  ]
  return loads.flat().every((pool) => Number.isSafeInteger(pool.capacity) && pool.capacity > 0) ? { loads, excluded, space } : null
}

/** Keywords as a rule prints them: "Necron Warrior models" are units with the Necron Warriors keyword. */
function spelled(keywords: readonly string[]) {
  return keywords.flatMap((keyword) => {
    const name = withoutFactionPrefix(keyword)
    return name.endsWith('s') ? [name, name.slice(0, -1)] : [name, `${name}s`]
  })
}

const described = (load: readonly Pool[]) =>
  load.map((pool) => `${pool.capacity} ${pool.carries}${pool.maxWounds ? ` (up to ${pool.maxWounds} Wounds)` : ''}`).join(' and ')

/**
 * Where each passenger rides, or why they cannot all ride together.
 *
 * A passenger frozen without keywords, from a battle created before they were
 * recorded, is counted one space per model in the first allowance, as it always was.
 */
export function transportLoad(rule: TransportRule, passengers: readonly Passenger[]): TransportLoad | Refusal {
  const needs: { need: number; pools: number[] }[][] = rule.loads.map(() => [])
  for (const passenger of passengers) {
    if (passenger.alive <= 0) continue
    const keywords = passenger.keywords && spelled(passenger.keywords)
    if (!keywords) {
      needs.forEach((load) => load.push({ need: passenger.alive, pools: [0] }))
      continue
    }
    const matches = (selector: string) => matchesKeywordSelector(selector, keywords)
    const ridesAs = passenger.ridesAs && spelled(passenger.ridesAs)
    const admits = ridesAs ? (selector: string) => matchesKeywordSelector(selector, ridesAs) : matches
    const { wounds } = passenger
    if (rule.excluded.some((exclusion) => admits(exclusion.keywords) && !(exclusion.except && admits(exclusion.except))))
      return refuse('transport-ineligible', `this transport cannot carry ${passenger.name}`)
    const space = rule.space.filter((entry) => !entry.keywords || matches(entry.keywords))
    if (passenger.space === undefined && wounds === undefined && space.some((entry) => entry.moreWoundsThan !== undefined))
      return refuse('transport-capacity-unknown', `${passenger.name} has no single Wounds characteristic for this transport to measure`)
    const size = passenger.space ?? space.find((entry) => entry.moreWoundsThan === undefined || wounds! > entry.moreWoundsThan)?.size ?? 1
    const eligible = rule.loads.map((load) =>
      load.flatMap((pool, at) =>
        admits(pool.carries) && (pool.maxWounds === undefined || (wounds !== undefined && wounds <= pool.maxWounds)) ? [at] : [],
      ),
    )
    if (eligible.every((pools) => !pools.length)) return refuse('transport-ineligible', `this transport cannot carry ${passenger.name}`)
    eligible.forEach((pools, at) => needs[at]!.push({ need: passenger.alive * size, pools }))
  }
  for (const [at, load] of rule.loads.entries()) {
    const used = load.map(() => 0)
    const loadNeeds = needs[at]!
    // Few units fit in one transport, so trying every allowance for each is cheap.
    const fits = (next: number): boolean =>
      next === loadNeeds.length ||
      loadNeeds[next]!.pools.some((pool) => {
        if (used[pool]! + loadNeeds[next]!.need > load[pool]!.capacity) return false
        used[pool]! += loadNeeds[next]!.need
        if (fits(next + 1)) return true
        used[pool]! -= loadNeeds[next]!.need
        return false
      })
    if (fits(0)) return load.map((pool, index) => ({ ...pool, used: used[index]! }))
  }
  return refuse(
    'transport-full',
    rule.loads.length === 1 && rule.loads[0]!.length === 1
      ? `this transport can carry at most ${rule.loads[0]![0]!.capacity} models`
      : `this transport can carry at most ${rule.loads.map(described).join(', or ')} models`,
  )
}
