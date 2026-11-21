import type { CombatCarrier } from './combatLoadout'
import { wargearKey } from './wargearNames'

/** A battle's line of models, with the carriers whose models it holds, so the simulator can field what still stands. */
export type ModelLineDraft = {
  name: string
  models: number
  wargear: { name: string; count: number }[]
  carriers: number[]
}

const perModel = (carrier: CombatCarrier) =>
  JSON.stringify(
    carrier.weapons
      .filter((weapon) => weapon.count > 0)
      .map((weapon) => [wargearKey(weapon.name), weapon.count / carrier.models])
      .toSorted(([a], [b]) => String(a).localeCompare(String(b))),
  )

/**
 * A unit's models by what they are and carry: one line per kind a player would point at on the table.
 *
 * Carriers with the same name and the same wargear each are one line, since nobody can tell them apart. A
 * squad of one kind with a single piece of wargear the weapons leave out, held by fewer than all of them
 * (a Chaos icon, a Vexilla), splits its bearers off, as the data does itself for a vox-caster. Two such pieces
 * stay unsplit: nothing says whether one model carries both.
 */
export function modelLineDrafts(carriers: readonly CombatCarrier[], wargear: readonly { name: string; count: number }[]): ModelLineDraft[] {
  const drafts: (ModelLineDraft & { key: string })[] = []
  carriers.forEach((carrier, at) => {
    if (carrier.unitWide || carrier.models <= 0) return
    const key = `${carrier.name}\0${perModel(carrier)}`
    const same = drafts.find((draft) => draft.key === key)
    const pieces = carrier.weapons.filter((weapon) => weapon.count > 0)
    if (!same) {
      drafts.push({
        key,
        name: carrier.name,
        models: carrier.models,
        wargear: pieces.map(({ name, count }) => ({ name, count })),
        carriers: [at],
      })
      return
    }
    same.models += carrier.models
    same.carriers.push(at)
    for (const piece of pieces) {
      const held = same.wargear.find((candidate) => wargearKey(candidate.name) === wargearKey(piece.name))
      if (held) held.count += piece.count
    }
  })
  const lines = drafts.map(({ key: _key, ...draft }) => draft)
  return named(lines.length === 1 ? bearersApart(lines[0]!, carriers, wargear) : lines, wargear)
}

function bearersApart(only: ModelLineDraft, carriers: readonly CombatCarrier[], wargear: readonly { name: string; count: number }[]) {
  const carried = new Set(carriers.flatMap((carrier) => carrier.weapons.map((weapon) => wargearKey(weapon.name))))
  const extras = wargear.filter((piece) => !carried.has(wargearKey(piece.name)) && piece.count > 0 && piece.count < only.models)
  if (extras.length !== 1 || only.wargear.some((piece) => piece.count % only.models !== 0)) return [only]
  const [extra] = extras as [{ name: string; count: number }]
  const share = (models: number) => only.wargear.map((piece) => ({ name: piece.name, count: (piece.count / only.models) * models }))
  return [
    { name: `${only.name} w/ ${extra.name}`, models: extra.count, wargear: [...share(extra.count), { ...extra }], carriers: only.carriers },
    { name: only.name, models: only.models - extra.count, wargear: share(only.models - extra.count), carriers: only.carriers },
  ]
}

const kindOf = (line: ModelLineDraft) => line.name.split(' w/ ')[0]!
const markOf = (line: ModelLineDraft) => line.name.split(' w/ ')[1]

/**
 * A line is named by its kind of model, and where the unit holds other lines of that kind, by what it carries
 * that they don't: "Plasma gun" beside "Shock Trooper", as a player says which one fell. The data's own
 * "Shock Trooper w/ Plasma Gun" names that piece; lines it doesn't tell apart name the wargear only they hold.
 */
function named(lines: ModelLineDraft[], wargear: readonly { name: string; count: number }[]): ModelLineDraft[] {
  return lines.map((line) => {
    const kin = lines.filter((other) => kindOf(other) === kindOf(line))
    const mark = markOf(line)
    const unmarked = kin.filter((other) => !markOf(other))
    if (kin.length === 1 || (!mark && unmarked.length === 1)) return { ...line, name: kindOf(line) }
    if (mark && kin.filter((other) => markOf(other) && wargearKey(markOf(other)!) === wargearKey(mark)).length === 1) {
      const held = line.wargear.find((piece) => wargearKey(piece.name) === wargearKey(mark))
      if (held) return { ...line, name: shown(held.name) }
      const listed = wargear.find((piece) => wargearKey(piece.name) === wargearKey(mark))
      // A piece the weapons leave out, such as a vox-caster, is still what this model carries.
      return listed
        ? { ...line, name: shown(listed.name), wargear: [...line.wargear, { name: listed.name, count: line.models }] }
        : { ...line, name: shown(mark) }
    }
    const holders = (piece: { name: string }) =>
      kin.filter((other) => other.wargear.some((held) => wargearKey(held.name) === wargearKey(piece.name))).length
    const alone = line.wargear.filter((piece) => holders(piece) === 1)
    const own = alone.length ? alone : line.wargear.filter((piece) => holders(piece) < kin.length)
    return { ...line, name: own.length ? shown(own.map((piece) => piece.name).join(', ')) : kindOf(line) }
  })
}

/** A name to read as a row's heading: no source marker, and a capital however the data writes it. */
const shown = (name: string) => {
  const unmarked = name.trim().replace(/^[^\p{L}\p{N}]+/u, '')
  return unmarked.charAt(0).toUpperCase() + unmarked.slice(1)
}
