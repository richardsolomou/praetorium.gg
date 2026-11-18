import { z } from 'zod'
import { plainQuotes, printedNumber } from './text'
import { defaultListName, type TextRoster, type TextRosterUnit, WTC_SECTION } from './textRoster'
import { GAME_SIZES } from './battle'

const unitHeader = /^(?:Char\d+:\s*)?(\d+)x\s+(.+?)\s+\(\d[\d,]*\s*(?:pts?|points?)\)(?::\s*(.*))?$/i
const modelLine = /^[•*]\s*(\d+)x\s+([^:]+?)(?::\s*(.*))?$/

/** A New Recruit link, which opens the list in New Recruit and carries none of it. */
export const isNewRecruitLink = (input: string) => /^(?:https?:\/\/)?(?:[\w-]+\.)?newrecruit\.eu(?:[/?#]\S*)?$/i.test(input.trim())

/** The list id of a New Recruit share link, as in `newrecruit.eu/app/list/Z6dRw`. */
export const newRecruitShareId = (input: string) =>
  /^(?:https?:\/\/)?(?:[\w-]+\.)?newrecruit\.eu\/app\/list\/([\w-]{1,32})\/?(?:[?#]\S*)?$/i.exec(input.trim())?.[1] ?? null

type ShareNode = {
  name: string
  option_id?: string
  uid?: string
  amount?: number
  customName?: string
  associated?: { uid: string }[]
  options: ShareNode[]
}

const shareNode: z.ZodType<ShareNode> = z.lazy(() =>
  z.object({
    name: z.string().max(300),
    option_id: z.string().max(64).optional(),
    uid: z.string().max(64).optional(),
    amount: z.number().int().nonnegative().optional(),
    customName: z.string().max(200).optional(),
    associated: z
      .array(z.object({ uid: z.string().max(64) }))
      .max(20)
      .optional(),
    options: z.array(shareNode).max(500).default([]),
  }),
)

/** The part of a shared New Recruit list an import reads: BattleScribe's selection tree, which it is built on. */
export const newRecruitShareSchema = z.object({ name: z.string().max(200), totalCost: z.number().optional(), army: shareNode })

export type NewRecruitShare = z.infer<typeof newRecruitShareSchema>

/**
 * A shared New Recruit list as the list importer reads army text.
 *
 * The tree nests forces, then categories, then units. Inside a unit, a node with an amount and
 * choices beneath it is a model, a node with neither groups choices, and a leaf is a choice,
 * counted once when New Recruit leaves its amount out.
 *
 * `known` gives the catalogue's own name for a BattleScribe id, which reads a list New Recruit
 * shows in another language, and whether it is a model; New Recruit's label stands where the
 * catalogue has no such id.
 */
export function fromNewRecruitShare(
  share: NewRecruitShare,
  known: (id: string) => { name: string; model: boolean } | undefined = () => undefined,
): TextRoster | null {
  const book = share.army.options[0]
  if (!book) return null
  const label = (node: ShareNode) => (node.option_id && known(node.option_id)?.name) || node.name
  const forces = book.options
  const categories = forces.flatMap((force) => force.options)
  // A Crusade force keeps its setup in a Configuration entry under its Crusade Army category, beside a Configuration category of visibility toggles.
  const setup = [...categories, ...categories.flatMap((category) => category.options)]
    .filter((node) => node.option_id === SETUP.configuration)
    .flatMap((node) => node.options)
  const chosen = (found: (node: ShareNode) => boolean) =>
    setup
      .filter(found)
      .flatMap((node) => node.options.flatMap((child) => leaves(child)))
      .filter((leaf) => (leaf.amount ?? 1) > 0)
  const size = chosen((node) => node.option_id === SETUP.battleSize)[0]?.name ?? null
  const others = setup.filter((node) => !Object.values(SETUP).includes(node.option_id ?? ''))
  const detachments = others.find((node) => /detach/i.test(label(node))) ?? others[0]
  const limit = size ? Number(/\(([\d.,]+)/.exec(size)?.[1]?.replaceAll(/[.,]/g, '') ?? '') || null : null
  const nodes = categories
    .filter((category) => !Object.values(SETUP).includes(category.option_id ?? ''))
    .flatMap((category) => category.options.filter((unit) => (unit.amount ?? 1) > 0 && unit.option_id !== SETUP.configuration))
  // A bodyguard names the characters joining it, so each of them is attached to the bodyguard's entry.
  const bodyguards = new Map(nodes.flatMap((node, at) => (node.associated ?? []).map((link) => [link.uid, at + 1] as const)))
  // A list saved on older data can hold wargear since split up, as a "Bolt Rifle w/ Grenade Launcher"; the pieces under it say it all.
  const bundleSinceSplit = (node: ShareNode) => node.option_id !== undefined && !known(node.option_id)
  // A loadout choice can hold the models taking it, as "8 chainblades" holds eight Jakhals; only the catalogue tells it from a bundle on a model.
  const holdsModels = (node: ShareNode) => node.options.some((child) => child.option_id !== undefined && known(child.option_id)?.model)
  // A single-model datasheet's wargear can come as a bundle with its pieces beneath, as a Knight Despoiler's "Gatling cannon and flamer".
  const isBundle = (node: ShareNode) => node.option_id !== undefined && known(node.option_id)?.model === false
  const units = nodes.map((node, at): TextRosterUnit => {
    const selections: TextRosterUnit['selections'] = []
    let models = 0
    let warlord = false
    const visit = (parent: ShareNode, model: string | undefined, multiplier: number) => {
      for (const child of parent.options) {
        const amount = child.amount ?? (child.options.length ? undefined : 1)
        if (amount === 0) continue
        if (!child.options.length) {
          if (/^warlord$/i.test(label(child))) warlord = true
          else selections.push({ name: label(child), count: amount! * multiplier, ...(model ? { model } : {}) })
        } else if (amount === undefined || bundleSinceSplit(child) || holdsModels(child)) visit(child, model, (amount ?? 1) * multiplier)
        else if (!model && !isBundle(child)) {
          models += amount * multiplier
          selections.push({ name: label(child), count: amount * multiplier })
          visit(child, label(child), amount * multiplier)
        } else {
          selections.push({ name: label(child), count: amount * multiplier, ...(model ? { model } : {}) })
          visit(child, model, amount * multiplier)
        }
      }
    }
    visit(node, undefined, 1)
    const target = node.uid ? bodyguards.get(node.uid) : undefined
    return {
      name: label(node),
      ...(node.customName && node.customName !== node.name ? { nickname: node.customName } : {}),
      selections,
      leading: null,
      models: models || 1,
      entry: at + 1,
      ...(target ? { attachedToEntry: target } : {}),
      warlord,
    }
  })
  return {
    name: share.name.trim() || book.name,
    ...(share.totalCost ? { reportedPoints: share.totalCost } : {}),
    faction: book.name,
    detachment:
      chosen((node) => node === detachments)
        .map(label)
        .join(', ') || null,
    disposition: chosen((node) => node.option_id === SETUP.disposition).map(label)[0] ?? null,
    limit,
    ...(size ? { sizeName: size.replace(/\s*\(.*$/, '') } : {}),
    units,
  }
}

/**
 * The game system's own setup entries, by BattleScribe id since New Recruit translates their names.
 * The detachment entry differs by army: the remaining one named for detachments, or in another
 * language the first of the rest. The reference category holds rules reminders and Crusade's Order
 * of Battle its supply and requisition, not units.
 */
const SETUP = {
  configuration: '4ac9-fd30-1e3d-b249',
  battleSize: '564e-fbc6-5266-3ea4',
  disposition: '2f69-9148-45b4-86a8',
  visibility: 'e8ef-836a-a9d1-901d',
  reference: 'eef1-be80-500a-edfc',
  orderOfBattle: 'ac7e-be7b-eb02-4752',
}

const leaves = (node: ShareNode): ShareNode[] => (node.options.length ? node.options.flatMap((child) => leaves(child)) : [node])

export function fromNewRecruitText(input: string): TextRoster | null {
  const lines = input.replaceAll('\r', '').split('\n')
  const faction = metadata(lines, 'FACTION KEYWORD')
  const newRecruit = /Created with newrecruit\.eu/i.test(input)
  const native = faction !== null && (/Exported with Praetorium\.gg/i.test(input) || (!newRecruit && /^\+ ROSTER NAME:/m.test(input)))
  const setup = faction === null ? appSetup(lines) : null
  if (setup) return { ...setup, units: newRecruitUnits(lines) }
  if (!newRecruit && !native) return null

  const rawDetachment = metadata(lines, 'DETACHMENT')
  const detachment = (native ? rawDetachment : rawDetachment?.replace(/\s+\([^()]+\)\s*$/, '')) ?? null
  const disposition = metadata(lines, 'FORCE DISPOSITION')
  const points = metadata(lines, 'TOTAL ARMY POINTS')?.match(/([\d,]+)\s*pts?/i)?.[1]
  const total = points ? printedNumber(points) : null
  const battleSize = metadata(lines, 'BATTLE SIZE')?.match(/^([\d,]+)pts(?:\s+\((.+)\))?$/i)
  const explicitLimit = battleSize?.[1]
  const limit = explicitLimit ? printedNumber(explicitLimit) : sizeFor(total)
  const warlord = metadata(lines, 'WARLORD')?.replace(/^Char\d+:\s*/i, '') ?? null
  const units = newRecruitUnits(lines, native)

  if (warlord) {
    const unit = units.find((candidate) => normalized(candidate.name) === normalized(warlord))
    if (unit) unit.warlord = true
  }

  return {
    name: metadata(lines, 'ROSTER NAME') ?? defaultListName(faction ?? '', total),
    ...(total !== null ? { reportedPoints: total } : {}),
    faction: faction ?? '',
    detachment: detachment === 'No detachment' ? null : detachment,
    disposition,
    limit,
    ...(battleSize?.[2] ? { sizeName: battleSize[2] } : {}),
    units,
  }
}

const sizeFor = (total: number | null) => (total === null ? null : (GAME_SIZES.find((size) => size.limit >= total)?.limit ?? total))

const appPoints = /^(.+?)\s+\(([\d,]+) Points\)$/i
const detachmentPoints = /\s*\(\d+ Detachment Points?\)$/i

/**
 * The official app's setup, which New Recruit can write over its own units, with or without its footer: the title, the
 * faction under any parent faction, the detachments priced in their own points, the disposition, and the battle size.
 */
function appSetup(lines: readonly string[]): Omit<TextRoster, 'units'> | null {
  const firstUnit = lines.findIndex((line) => unitHeader.test(line.trim()))
  const head = lines.slice(0, Math.max(0, firstUnit)).map((line) => line.trim())
  const detachmentAt = head.findLastIndex((line) => detachmentPoints.test(line))
  if (detachmentAt < 0) return null
  const priced = head.map((line) => line.match(appPoints))
  const titleAt = priced.findIndex((match, at) => match && at < detachmentAt)
  const sizeAt = priced.findIndex((match, at) => match && at > detachmentAt)
  const title = priced[titleAt]
  const size = priced[sizeAt]
  const faction = head.slice(titleAt + 1, detachmentAt).findLast(Boolean) ?? ''
  const total = title ? printedNumber(title[2]!) : null
  const between = head.slice(detachmentAt + 1, size ? sizeAt : undefined).filter(Boolean)
  return {
    name: title?.[1] ?? defaultListName(faction, total),
    ...(total !== null ? { reportedPoints: total } : {}),
    faction,
    detachment: head[detachmentAt]!.replace(detachmentPoints, ''),
    disposition: between.length === 1 ? between[0]! : null,
    limit: size ? printedNumber(size[2]!) : sizeFor(total),
    ...(size ? { sizeName: size[1]! } : {}),
  }
}

/** The units of a New Recruit tournament layout: "2x Unit (90 pts): wargear", with its models as bullets beneath. */
export function newRecruitUnits(lines: readonly string[], native = false) {
  const units: TextRosterUnit[] = []
  let current: TextRosterUnit | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (/^(Created with |Exported with |Ruleset:|Codex:)/i.test(trimmed) || WTC_SECTION.test(trimmed)) {
      current = null
      continue
    }
    const header = trimmed.match(unitHeader)
    if (header) {
      current = {
        name: header[2]!.trim(),
        models: Number(header[1]!),
        selections: [],
        leading: null,
        leader: null,
        warlord: false,
      }
      addDetails(current, header[3] ?? '', 1)
      units.push(current)
      continue
    }
    if (!current) continue

    const identity = trimmed.match(/^(Roster entry|Attached to entry):\s*(\d+)$/i)
    if (identity) {
      current[identity[1]!.toLowerCase() === 'roster entry' ? 'entry' : 'attachedToEntry'] = Number(identity[2])
      continue
    }

    const leading = trimmed.match(/^(?:Leading|Supporting):?\s+(.+)$/i)
    if (leading) {
      current.leading = relationName(leading[1]!)
      continue
    }
    const attached = trimmed.match(/^Attached to:?\s+(.+)$/i)
    if (attached) {
      current.leader = relationName(attached[1]!)
      continue
    }
    const enhancement = trimmed.match(/^Enhancement:\s*(.+)$/i)
    if (enhancement) {
      const name = enhancement[1]!.replace(/\s+\([+-]?\d+\s*pts?\)\s*$/i, '').trim()
      addSelection(current, `Enhancement: ${name}`, 1)
      continue
    }
    const model = trimmed.match(modelLine)
    const equipment = native ? trimmed.match(/^[•*]\s*(\d+)x\s+(.+)$/) : null
    if (equipment) {
      addSelection(current, equipment[2]!, Number(equipment[1]))
      continue
    }
    if (model) {
      const count = Number(model[1]!)
      addSelection(current, model[2]!, count)
      addDetails(current, model[3] ?? '', count)
      continue
    }
    const nested = trimmed.match(/^(\d+)\s+with\s+(.+)$/i)
    if (nested) addDetails(current, nested[2]!, Number(nested[1]!))
    // A unit's own wargear can wrap onto the line under its header, as "2x Tome-skull".
    else if (/^\d+x\s/.test(trimmed)) addDetails(current, trimmed, 1)
    else if (trimmed) (current.unread ??= []).push(trimmed)
  }
  return units
}

function metadata(lines: readonly string[], name: string) {
  const prefix = new RegExp(`^\\+\\s*${name}:\\s*(.+)$`, 'i')
  return lines.map((line) => line.trim().match(prefix)?.[1]?.trim().replace(/\s+/g, ' ')).find(Boolean) ?? null
}

const relationName = (value: string) => value.trim().replace(/\[\d+\]$/, '')

/** A unit's details, where "N with" counts what follows it for N models, as in "Plasmacyte, 3 with Skorpekh hyperphase weapons". */
function addDetails(unit: TextRosterUnit, details: string, defaultMultiplier: number) {
  let multiplier = defaultMultiplier
  for (const raw of details.split(/,(?![^()]*\))/)) {
    let item = raw.trim().replace(/\s+\([+-]?\d+\s*pts?\)\s*$/i, '')
    const grouped = item.match(/^(\d+)\s+with\s+(.+)$/i)
    if (grouped) {
      multiplier = Number(grouped[1]!)
      item = grouped[2]!
    }
    if (!item) continue
    if (/^Warlord$/i.test(item)) {
      unit.warlord = true
      continue
    }
    const counted = item.match(/^(\d+)x\s+(.+)$/i)
    addSelection(unit, counted?.[2] ?? item, Number(counted?.[1] ?? 1) * multiplier)
  }
}

function addSelection(unit: TextRosterUnit, name: string, count: number) {
  const clean = name.trim()
  const existing = unit.selections.find((selection) => normalized(selection.name) === normalized(clean))
  if (existing) existing.count += count
  else unit.selections.push({ name: clean, count })
}

const normalized = (value: string) => plainQuotes(value.trim().toLocaleLowerCase())
