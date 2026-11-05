import { attachGroups, starredLabel, textNickname, WTC_SECTION, type TextRoster, type TextRosterUnit } from './textRoster'

/**
 * A points figure grouped in any locale's style, read as "(1 995 Punkte)", "(1'995 Punkte)" or "(2 Detachment Points)":
 * the name before it, the number, and its unit, whole because Spanish prices both in "puntos" and a detachment in
 * "puntos de destacamento". Text pasted through some apps loses the brackets and
 * the space before a unit's price, as in "Rhino70 points". A unit's "*" refers to a footnote naming a keyword it gains.
 */
const pricePattern =
  /^(.*?)\s*(?:\((\d{1,3}(?:[\s.,'’]\d{3})+|\d+)\s+([^;)]*[^\s;)])[^)]*\)\*?|(?<=.)(\d{1,3}(?:[\s.,'’]\d{3})+|\d+)\s+(\S+))$/
// The app lists each further piece of a model's wargear under the same bullet, on an unbulleted counted line.
// Some of its translations write the count without the "x", as the Spanish "1 Mass gauntlet".
const selection = /^(?=[•◦]|\d+x?\s)(?:[•◦]\s*)?(?:(\d+)x?\s+)?(.+?)$/
const labelled = /^([^:]+):\s*(.+)$/
const game = /^Warhammer 40,?000$/i
const appVersion = /\bv\d+(?:\.\d+)+\s+\(\d+\)/

function price(line: string) {
  const match = line.match(pricePattern)
  return match
    ? {
        name: match[1]!,
        points: Number((match[2] ?? match[4])!.replaceAll(/\D/g, '')),
        unit: (match[3] ?? match[5])!.toLowerCase().replace(/s$/, ''),
        bracketed: match[3] !== undefined,
      }
    : null
}

/**
 * The official app's layout, which BattleBase, New Recruit, Warmind and Praetorium also write.
 *
 * The app translates its labels, so the layout is read by structure: the commonest points word prices the title, the
 * battle size and each unit, the setup paragraph holding the detachments names the faction, a line ending in a number heads an
 * attached group whose last unit is the bodyguard, and any other line over a unit or alone in its paragraph is a section
 * heading. The labels of other tools, which write only English, are still read by name.
 */
export function fromBattleBaseText(input: string): TextRoster | null {
  // The app can print a model's first piece of wargear on the model's own line, as "• 4x Prosecutors     • 4x Boltgun".
  const raw = input
    .replaceAll('\r', '')
    .split('\n')
    .map(starredLabel)
    .flatMap((line) => {
      const joined = line.match(/^(\s*)(•\s*\d+x?\s.*?\S)\s{2,}(•\s*.+)$/)
      return joined ? [`${joined[1]}${joined[2]}`, `${joined[1]}  ${joined[3]}`] : [line]
    })
  const lines = raw.map((line) => line.trim())
  const prices = lines.map((line) => (selection.test(line) ? null : price(line)))
  // Units outnumber the title, the battle size and the detachments, so the commonest points word is the one they share.
  const tally = new Map<string, number>()
  for (const priced of prices) if (priced) tally.set(priced.unit, (tally.get(priced.unit) ?? 0) + 1)
  const pointsWord = [...tally].reduce((best, next) => (next[1] > best[1] ? next : best), ['points', 0])[0]
  const inPoints = (at: number) => prices[at]?.unit === pointsWord
  const isUnit = (line: string) => !selection.test(line) && price(line)?.unit === pointsWord
  const nextAt = (from: number) => lines.findIndex((line, at) => at > from && line)
  const paragraphEnd = (at: number) => {
    while (at < lines.length && lines[at]) at++
    return at
  }
  const firstAt = lines.findIndex(Boolean)
  const firstUnitAt = prices.findIndex((_, at) => inPoints(at) && selection.test(lines[nextAt(at)] ?? ''))
  // Detachments are priced in brackets in their own points, so the last such line above the first unit anchors the setup
  // wherever the title and any note above it end. The faction is the line above the detachments and any battle size printed between
  // them, after a chapter's parent faction. Older layouts price no detachment and put the setup in the paragraph under the title.
  const detachmentAt = prices
    .slice(0, firstUnitAt < 0 ? lines.length : firstUnitAt)
    .findLastIndex((priced) => priced?.bracketed && priced.unit !== pointsWord)
  let factionAt = detachmentAt
  let setupStart: number
  if (detachmentAt >= 0) {
    while (factionAt >= 0 && prices[factionAt]) factionAt--
    setupStart = Math.max(0, factionAt)
    while (setupStart > 0 && lines[setupStart - 1]) setupStart--
  } else {
    setupStart = firstAt + 1
    while (setupStart < lines.length && (!lines[setupStart] || game.test(lines[setupStart]!))) setupStart++
    factionAt = setupStart
  }
  // The title is the last line priced in points above the faction, or the line above it when the title's points wrapped
  // onto a line of their own. Without one, the first line names the list.
  // No wargear comes above the setup, so a title can open with a number, as "1 - Imperialis Fleet (2000 points)".
  const titleAt = lines.slice(0, Math.max(0, factionAt)).findLastIndex((line) => price(line)?.unit === pointsWord)
  const titlePrice = titleAt >= 0 ? price(lines[titleAt]!) : null
  const title =
    titlePrice?.name ||
    lines.slice(0, Math.max(0, titleAt)).findLast(Boolean) ||
    (firstAt < setupStart ? lines[firstAt] : '') ||
    'Imported list'
  setupStart = Math.max(setupStart, titleAt + 1)
  let setupEnd = paragraphEnd(Math.max(setupStart, detachmentAt))
  const headingAt = lines.slice(factionAt + 1, setupEnd).findIndex((line) => WTC_SECTION.test(line))
  if (headingAt >= 0) setupEnd = factionAt + 1 + headingAt
  // A paste that lost its blank lines runs on into the units, so its setup ends at the battle size, or before the first
  // unit where the battle size comes first.
  const pricedInSetup = lines.slice(factionAt + 1, setupEnd).flatMap((_, at) => (inPoints(factionAt + 1 + at) ? [factionAt + 1 + at] : []))
  if (pricedInSetup.length > 1)
    setupEnd = pricedInSetup[0]! > detachmentAt ? pricedInSetup[0]! + 1 : (pricedInSetup.find((at) => at > detachmentAt) ?? setupEnd)
  const faction = lines[factionAt] ?? ''
  const armySetup = lines.slice(factionAt + 1, setupEnd).filter((line) => line && !game.test(line))
  let sizeLine = armySetup.find((line) => price(line)?.unit === pointsWord)
  // A battle size can sit alone in the paragraph after the detachments.
  const afterSetup = nextAt(setupEnd - 1)
  if (!sizeLine && detachmentAt >= 0 && afterSetup >= 0 && inPoints(afterSetup) && !lines[afterSetup + 1]) {
    sizeLine = lines[afterSetup]
    setupEnd = afterSetup + 1
  }
  const body = lines.slice(setupEnd)
  const exportedBy = /Exported with (?:BattleBase|Praetorium\.gg)/i.test(input)
  if (!exportedBy && ((detachmentAt < 0 && (!titlePrice || !faction || !sizeLine)) || !body.some(isUnit))) return null
  const size = sizeLine ? price(sizeLine) : null
  // Detachments are priced in their own points; Warmind gives each one a line.
  const pricedDetachments = armySetup.filter((line) => line !== sizeLine && price(line))
  const statedDisposition = armySetup.find((line) => labelled.test(line))
  // New Recruit and the official app write the disposition alone on the line after a priced detachment.
  const unlabelled = armySetup.filter((line) => line !== sizeLine && line !== statedDisposition && !pricedDetachments.includes(line))
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
  // A model's wargear sits under its line on "◦" or more deeply indented bullets, with further pieces on unbulleted lines.
  const nesting = raw.some((line) => /^\s*◦|^\s+•/.test(line))
  const indentOf = (at: number) => raw[setupEnd + at]!.search(/\S/)
  let modelLine: { name: string; indent: number } | undefined
  let model: string | undefined
  const next = (from: number) => body.findIndex((line, at) => at > from && line)
  // Without nesting, as in a paste that lost its indentation, a counted bullet over another heads a model.
  const headsModel = (at: number) => {
    const after = next(at)
    const following = body[after] ?? ''
    if (following.startsWith('◦')) return true
    if (!following.startsWith('•')) return false
    return nesting ? indentOf(after) > indentOf(at) : /^•\s*\d+x?\s/.test(following)
  }
  const isUnitAt = (at: number) => at >= 0 && isUnit(body[at]!)
  // French puts the number before a last word, as "Unité 1 Attachée". Under the "ATTACHED UNITS" heading, a player can name a group.
  let attachedSection = false
  const isGroupHeadingAt = (at: number) =>
    at >= 0 && !WTC_SECTION.test(body[at]!) && (attachedSection || /\s\d+(?:\s\S+)?$/.test(body[at]!)) && isUnitAt(next(at))

  for (const [at, line] of body.entries()) {
    if (!line) continue
    if (/^(?:Exported with |Codex:|Ruleset:|TOTAL ARMY POINTS:)/i.test(line) || appVersion.test(line)) {
      current = null
      continue
    }
    if (isUnit(line)) {
      current = { name: price(line)!.name, selections: [], leading: null, warlord: false }
      modelLine = model = undefined
      units.push(current)
      group?.push(current)
      continue
    }
    const picked = line.match(selection)
    if (WTC_SECTION.test(line)) attachedSection = /^ATTACHED UNITS?$/i.test(line)
    if (!picked) {
      if (isGroupHeadingAt(at)) {
        group = []
        groups.push(group)
        current = null
      } else if (WTC_SECTION.test(line) || isUnitAt(next(at)) || isGroupHeadingAt(next(at)) || (!body[at - 1] && !body[at + 1])) {
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
    const modelCount = line.match(/^[•◦]?\s*(\d+) models?$/i)
    if (modelCount) {
      current.models = Number(modelCount[1])
      continue
    }
    const name = picked[2]!
    if (line.startsWith('•')) {
      if (picked[1] && headsModel(at)) {
        modelLine = { name, indent: indentOf(at) }
        model = undefined
      } else if (nesting && (!modelLine || indentOf(at) <= modelLine.indent)) modelLine = model = undefined
      else model = modelLine?.name
    } else if (line.startsWith('◦')) model = modelLine?.name
    const numeric = name.match(/^(Models|Roster entry|Attached to entry):\s*(\d+)$/i)
    const label = picked[1] ? null : name.match(labelled)
    if (numeric) {
      const field = { models: 'models', 'roster entry': 'entry', 'attached to entry': 'attachedToEntry' } as const
      current[field[numeric[1]!.toLowerCase() as keyof typeof field]] = Number(numeric[2])
    } else if (/^(?:Custom name|Nickname):/i.test(name)) current.nickname = textNickname(name.replace(/^(?:Custom name|Nickname):\s*/i, ''))
    else if (/^Warlord$/i.test(name)) current.warlord = true
    else if (/^(?:Leading|Supporting):/i.test(name)) current.leading = name.replace(/^(?:Leading|Supporting):\s*/i, '').trim()
    else if (/^(?:Leader|Support):/i.test(name)) current.leader = name.replace(/^(?:Leader|Support):\s*/i, '').trim()
    else {
      const chosen = { name: label ? label[2]! : name, count: Number(picked[1] ?? 1), ...(model ? { model } : {}) }
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
    name: title,
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
