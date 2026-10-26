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
import type { KeyedPick } from '../rosterPicks'

/** A card's line saying where its unit rides, or who rides in it; `passenger` is the card whose choice it shows. */
type EmbarkRow = { label: string; name: string; action: string; passenger: number }

/** A pairing a card's menu offers, greyed out with `reason` when setup would refuse it. */
export type EmbarkChoice = { passenger: number; transport: number; name: string; detail: string | null; reason: string | null }

export type EmbarkCard = {
  /** The transport this unit starts in. */
  ridesIn?: EmbarkRow
  /** The units starting in this transport. */
  carries: EmbarkRow[]
  /** Transports this unit could start in. */
  canBoard: EmbarkChoice[]
  /** Units that could start in this transport. */
  canCarry: EmbarkChoice[]
}

export const NO_EMBARK: EmbarkCard = { carries: [], canBoard: [], canCarry: [] }

/** A card's embark rows: where it rides, then who rides in it. */
export const embarkRows = ({ ridesIn, carries }: EmbarkCard) => [...(ridesIn ? [ridesIn] : []), ...carries]

/** What a unit's card shows; inside an attached unit's outline, only what it carries, as the outline speaks for the unit. */
export const cardEmbark = (card: EmbarkCard, inAttachedUnit: boolean): EmbarkCard =>
  inAttachedUnit ? { ...NO_EMBARK, carries: card.carries, canCarry: card.canCarry } : card

/**
 * What each card says and offers about the list's starting embarks, as setup will judge them.
 *
 * `cardOf` names the card for a unit by its position in `submitted`. An attached unit
 * boards as one, offered and listed by its bodyguard; its characters' cards say where it rides.
 * A pairing the transport can never carry is left out rather than greyed out, so a tank
 * is not offered every Rhino in the list. The cards in `edited` are judged last, so
 * an edit that overfills a transport puts back the unit it changed.
 */
export function embarkCards(
  submitted: readonly SubmittedUnit[],
  cardOf: (at: number) => number = (at) => at,
  edited: readonly number[] = [],
) {
  const fielded = fieldedUnits(submitted)
  const cardOfKey = new Map(fielded.map((unit, at) => [unit.key, cardOf(at)]))
  const card = (unit: UnitState) => cardOfKey.get(unit.key)!
  const started = startingEmbarks(
    fielded,
    fielded.flatMap((unit) => (edited.includes(card(unit)) ? [unit.key] : [])),
  )
  const named = (unit: UnitState) => transportLabel(fielded, unit.key) ?? unit.name
  const transports = fielded.filter((unit) => canTransport(unit) && !unit.attachedTo)
  const passengers = attachedUnitList(started).filter(({ host, joined }) => ![host, ...joined].some(canTransport))
  const aboard = (transport: UnitState) =>
    transportAboard(
      transport,
      started.filter((unit) => unit.embarkedIn === transport.key),
    )
  const pairing = (passenger: UnitState, transport: UnitState, name: string, detail: string | null): EmbarkChoice[] => {
    const refusal = startingEmbarkRefusal(fielded, passenger.key, transport.key)
    if (refusal?.code === 'transport-ineligible') return []
    return [{ passenger: card(passenger), transport: card(transport), name, detail, reason: refusal?.message ?? null }]
  }
  const offered = (choices: EmbarkChoice[]) =>
    choices.toSorted((left, right) => Number(Boolean(left.reason)) - Number(Boolean(right.reason)))

  const cards = new Map<number, EmbarkCard>(fielded.map((unit) => [card(unit), { carries: [], canBoard: [], canCarry: [] }]))
  for (const { host, joined } of passengers) {
    const transport = transports.find((candidate) => candidate.key === host.embarkedIn)
    if (transport) {
      for (const unit of attachedUnits(started, host.key)) {
        cards.get(card(unit))!.ridesIn = { label: 'Embarked in', name: named(transport), action: 'Remove', passenger: card(host) }
      }
      cards.get(card(transport))!.carries.push({
        label: 'Embarked',
        name: [host, ...joined].map(named).join(' + '),
        action: 'Disembark',
        passenger: card(host),
      })
      // A unit aboard is offered nowhere else, so its only way out is Remove or Disembark.
      continue
    }
    cards.get(card(host))!.canBoard = offered(
      transports.flatMap((candidate) => pairing(host, candidate, named(candidate), aboard(candidate))),
    )
    for (const candidate of transports) {
      const detail = joined.length ? `With ${joined.map(named).join(', ')}` : null
      cards.get(card(candidate))!.canCarry.push(...pairing(host, candidate, named(host), detail))
    }
  }
  for (const transport of transports) cards.get(card(transport))!.canCarry = offered(cards.get(card(transport))!.canCarry)

  return {
    cards,
    /** Cards whose starting embark the list can no longer hold, with the transport each was in. */
    dropped: started.flatMap((unit) =>
      unit.startingEmbarkRefused && unit.startsEmbarkedIn
        ? [{ card: card(unit), name: named(unit), transport: transportLabel(fielded, unit.startsEmbarkedIn) ?? 'its transport' }]
        : [],
    ),
  }
}

const withoutEmbark = ({ embarkedIn: _embarkedIn, ...pick }: KeyedPick) => JSON.stringify(pick)

/** The keys of the picks an edit added or changed, leaving out starting embarks, which only move units. */
export function editedPicks(before: readonly KeyedPick[], after: readonly KeyedPick[]) {
  const was = new Map(before.map((pick) => [pick.key, withoutEmbark(pick)]))
  return after.flatMap((pick) => (was.get(pick.key) === withoutEmbark(pick) ? [] : [pick.key]))
}

/** A unit an edit put back on the battlefield, and the pick as the edit left it. */
type PutBack = { name: string; transport: string; pick: KeyedPick }

/** The dropped embarks the picks still hold, which the builder puts back. */
export const putBacks = (dropped: readonly { card: number; name: string; transport: string }[], picks: readonly KeyedPick[]): PutBack[] =>
  dropped.flatMap(({ card, name, transport }) => {
    const pick = picks.find((each) => each.key === card && each.embarkedIn !== undefined)
    return pick ? [{ name, transport, pick }] : []
  })
