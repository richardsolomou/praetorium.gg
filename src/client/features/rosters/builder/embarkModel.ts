import {
  canTransport,
  fieldedUnits,
  startingEmbarkRefusal,
  startingEmbarks,
  type SubmittedUnit,
  transportAboard,
  transportLabel,
  type UnitState,
} from '../../../../core/battle'
import { attachedUnitList, attachedUnits } from '../../../../core/attachedUnits'

/** A card's line saying where its unit rides, or who rides in it; `passenger` is the card whose choice it shows. */
export type EmbarkRow = { label: string; name: string; detail?: string; action: string; passenger: number }

/** A pairing a card's menu offers, greyed out with `reason` when setup would refuse it. */
export type EmbarkChoice = { passenger: number; transport: number; name: string; detail: string | null; reason: string | null }

export type EmbarkCard = {
  rows: EmbarkRow[]
  /** Transports this unit could start in. */
  canBoard: EmbarkChoice[]
  /** Units that could start in this transport. */
  canCarry: EmbarkChoice[]
}

export const NO_EMBARK: EmbarkCard = { rows: [], canBoard: [], canCarry: [] }

/**
 * What each card says and offers about the list's starting embarks, as setup will judge them.
 *
 * `cardOf` names the card for a unit by its position in `submitted`. An attached unit
 * boards as one, offered and listed by its bodyguard; its characters' cards say where it rides.
 * A pairing the transport can never carry is left out rather than greyed out, so a tank
 * is not offered every Rhino in the list.
 */
export function embarkCards(submitted: readonly SubmittedUnit[], cardOf: (at: number) => number = (at) => at) {
  const fielded = fieldedUnits(submitted)
  const cardOfKey = new Map(fielded.map((unit, at) => [unit.key, cardOf(at)]))
  const card = (unit: UnitState) => cardOfKey.get(unit.key)!
  const started = startingEmbarks(fielded)
  const named = (unit: UnitState) => transportLabel(fielded, unit.key) ?? unit.name
  const transports = fielded.filter((unit) => canTransport(unit) && !unit.attachedTo)
  const passengers = attachedUnitList(started).filter(({ host, joined }) => ![host, ...joined].some(canTransport))
  const aboard = (transport: UnitState, host?: UnitState) =>
    transportAboard(
      transport,
      started.filter((unit) => unit.embarkedIn === transport.key && (!host || (unit.attachedTo ?? unit.key) === host.key)),
    )
  const pairing = (passenger: UnitState, transport: UnitState, name: string, detail: string | null): EmbarkChoice[] => {
    const refusal = startingEmbarkRefusal(fielded, passenger.key, transport.key)
    if (refusal?.code === 'transport-ineligible') return []
    return [{ passenger: card(passenger), transport: card(transport), name, detail, reason: refusal?.message ?? null }]
  }
  const offered = (choices: EmbarkChoice[]) =>
    choices.toSorted((left, right) => Number(Boolean(left.reason)) - Number(Boolean(right.reason)))

  const cards = new Map<number, EmbarkCard>(fielded.map((unit) => [card(unit), { rows: [], canBoard: [], canCarry: [] }]))
  for (const { host, joined } of passengers) {
    const transport = transports.find((candidate) => candidate.key === host.embarkedIn)
    if (transport) {
      for (const unit of attachedUnits(started, host.key)) {
        cards.get(card(unit))!.rows.push({ label: 'Embarked in', name: named(transport), action: 'Remove', passenger: card(host) })
      }
      cards.get(card(transport))!.rows.push({
        label: 'Embarked',
        name: named(host),
        detail: aboard(transport, host) ?? undefined,
        action: 'Disembark',
        passenger: card(host),
      })
    }
    cards.get(card(host))!.canBoard = offered(
      transports
        .filter((candidate) => candidate !== transport)
        .flatMap((candidate) => pairing(host, candidate, named(candidate), aboard(candidate))),
    )
    for (const candidate of transports) {
      if (candidate === transport) continue
      const detail = joined.length ? `With ${joined.map((unit) => unit.name).join(', ')}` : null
      cards.get(card(candidate))!.canCarry.push(...pairing(host, candidate, named(host), detail))
    }
  }
  for (const transport of transports) cards.get(card(transport))!.canCarry = offered(cards.get(card(transport))!.canCarry)

  return {
    cards,
    /** Cards whose starting embark the list can no longer hold. */
    dropped: started.flatMap((unit) => (unit.startingEmbarkRefused ? [card(unit)] : [])),
  }
}
