import { attachGroups, type TextRoster, type TextRosterUnit } from './textRoster'

/**
 * A points figure grouped in any locale's style, read as "(1 995 Punkte)" or "(2 Detachment Points)":
 * the name before it, the number, and the first word of its unit.
 */
const pricePattern = /^(.+?)\s*\((\d{1,3}(?:[\s.,]\d{3})+|\d+)\s+([^\s;)]+)[^)]*\)$/
const selection = /^[•◦]\s*(?:(\d+)x\s+)?(.+?)$/
const labelled = /^([^:]+):\s*(.+)$/
const appVersion = /\bv\d+(?:\.\d+)+\s+\(\d+\)/

function price(line: string) {
  const match = line.match(pricePattern)
  return match ? { name: match[1]!, points: Number(match[2]!.replaceAll(/\D/g, '')), unit: match[3]!.toLowerCase() } : null
}

/**
 * The official app's layout, which BattleBase, New Recruit, Warmind and Praetorium also write.
 *
 * The app translates its labels, so the layout is read by structure: the title's points word prices the battle size and
 * each unit, the setup paragraph under the title names the faction and detachments, a line ending in a number heads an
 * attached group whose last unit is the bodyguard, and any other line over a unit or alone in its paragraph is a section
 * heading. The labels of other tools, which write only English, are still read by name.
 */
export function fromBattleBaseText(input: string): TextRoster | null {
  const lines = input
    .replaceAll('\r', '')
    .split('\n')
    .map((line) => line.trim())
  const titleAt = lines.findIndex(Boolean)
  const title = lines[titleAt] ?? 'Imported list'
  const titlePrice = price(title)
  const pointsWord = titlePrice?.unit ?? 'points'
  let setupEnd = titleAt + 1
  while (setupEnd < lines.length && !lines[setupEnd]) setupEnd++
  const setupStart = setupEnd
  while (setupEnd < lines.length && lines[setupEnd]) setupEnd++
  const setup = lines.slice(setupStart, setupEnd).filter((line) => !/^Warhammer 40,?000$/i.test(line))
  const body = lines.slice(setupEnd)
  const isUnit = (line: string) => !selection.test(line) && price(line)?.unit === pointsWord

  const faction = setup[0] ?? ''
  const sizeLine = setup.slice(1).find((line) => price(line)?.unit === pointsWord)
  const exportedBy = /Exported with (?:BattleBase|Praetorium\.gg)/i.test(input)
  if (!exportedBy && (!titlePrice || !faction || !sizeLine || !body.some(isUnit))) return null
  const size = sizeLine ? price(sizeLine) : null
  // Detachments are priced in their own points; Warmind gives each one a line.
  const pricedDetachments = setup.slice(1).filter((line) => line !== sizeLine && price(line))
  const statedDisposition = setup.slice(1).find((line) => labelled.test(line))
  // New Recruit and the official app write the disposition alone on the line after a priced detachment.
  const unlabelled = setup.slice(1).filter((line) => line !== sizeLine && line !== statedDisposition && !pricedDetachments.includes(line))
  const dispositionLine = statedDisposition ?? (pricedDetachments.length && unlabelled.length === 1 ? unlabelled[0] : undefined)
  const detachment = pricedDetachments.length
    ? pricedDetachments.map((line) => price(line)!.name).join(', ')
    : unlabelled.find((line) => line !== dispositionLine)

  const units: TextRosterUnit[] = []
  const unread: string[] = []
  const groups: TextRosterUnit[][] = []
  const labels = new Map<TextRosterUnit, { label: string; selection: TextRosterUnit['selections'][number] }[]>()
  const bare: { unit: TextRosterUnit; selection: TextRosterUnit['selections'][number] }[] = []
  let group: TextRosterUnit[] | null = null
  let current: TextRosterUnit | null = null
  const next = (from: number) => body.findIndex((line, at) => at > from && line)
  const isUnitAt = (at: number) => at >= 0 && isUnit(body[at]!)
  const isGroupHeadingAt = (at: number) => at >= 0 && /\s\d+$/.test(body[at]!) && isUnitAt(next(at))

  for (const [at, line] of body.entries()) {
    if (!line) continue
    if (/^(?:Exported with |Codex:|Ruleset:|TOTAL ARMY POINTS:)/i.test(line) || appVersion.test(line)) {
      current = null
      continue
    }
    if (isUnit(line)) {
      current = { name: price(line)!.name, selections: [], leading: null, warlord: false }
      units.push(current)
      group?.push(current)
      continue
    }
    const picked = line.match(selection)
    if (!picked) {
      if (isGroupHeadingAt(at)) {
        group = []
        groups.push(group)
        current = null
      } else if (isUnitAt(next(at)) || isGroupHeadingAt(next(at)) || (!body[at - 1] && !body[at + 1])) {
        group = null
        current = null
      } else if (current) (current.unread ??= []).push(line)
      else unread.push(line)
      continue
    }
    if (!current) {
      unread.push(line)
      continue
    }
    const name = picked[2]!
    const numeric = name.match(/^(Models|Roster entry|Attached to entry):\s*(\d+)$/i)
    const modelCount = name.match(/^(\d+) models?$/i)
    const label = picked[1] ? null : name.match(labelled)
    if (modelCount) current.models = Number(modelCount[1])
    else if (numeric) {
      const field = { models: 'models', 'roster entry': 'entry', 'attached to entry': 'attachedToEntry' } as const
      current[field[numeric[1]!.toLowerCase() as keyof typeof field]] = Number(numeric[2])
    } else if (/^Nickname:/i.test(name)) (current.unread ??= []).push(line)
    else if (/^Warlord$/i.test(name)) current.warlord = true
    else if (/^(?:Leading|Supporting):/i.test(name)) current.leading = name.replace(/^(?:Leading|Supporting):\s*/i, '').trim()
    else if (/^(?:Leader|Support):/i.test(name)) current.leader = name.replace(/^(?:Leader|Support):\s*/i, '').trim()
    else {
      const chosen = { name: label ? label[2]! : name, count: Number(picked[1] ?? 1) }
      current.selections.push(chosen)
      if (label) labels.set(current, [...(labels.get(current) ?? []), { label: label[1]!, selection: chosen }])
      else if (!picked[1]) bare.push({ unit: current, selection: chosen })
    }
  }

  // The bodyguard's first label says how each unit of its group is attached; every other label names an enhancement.
  const attachmentLabels = new Set(
    groups.flatMap(
      (members) =>
        labels
          .get(members.at(-1)!)
          ?.slice(0, 1)
          .map(({ label }) => label) ?? [],
    ),
  )
  for (const [unit, stated] of labels)
    for (const { label, selection: chosen } of stated) {
      if (attachmentLabels.has(label)) unit.selections.splice(unit.selections.indexOf(chosen), 1)
      else chosen.name = `Enhancements: ${chosen.name}`
    }
  // The official app counts every piece of wargear, so its one uncounted, unlabelled line is the Warlord.
  const [warlord] = bare
  if (warlord && bare.length === 1 && !units.some((unit) => unit.warlord)) {
    warlord.unit.selections.splice(warlord.unit.selections.indexOf(warlord.selection), 1)
    warlord.unit.warlord = true
  }
  attachGroups(
    units,
    groups.filter((members) => members.length > 1).map((members) => ({ leaders: members.slice(0, -1), bodyguard: members.at(-1)! })),
  )

  return {
    name: titlePrice?.name ?? title,
    ...(titlePrice ? { reportedPoints: titlePrice.points } : {}),
    faction,
    detachment: detachment && detachment !== 'No detachment' ? detachment : null,
    disposition: dispositionLine?.match(labelled)?.[2] ?? dispositionLine ?? null,
    limit: size?.points ?? null,
    ...(size?.name ? { sizeName: size.name } : {}),
    units,
    ...(unread.length ? { unread } : {}),
  }
}
