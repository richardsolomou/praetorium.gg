import { describe, expect, it } from 'vitest'
import type { RosterPick } from '../../../../core/roster'
import { frozenUnits } from '../../../../core/rosterSnapshot'
import { cardEmbark, editedPicks, embarkCards, NO_EMBARK, putBacks, standingPutBacks, withPutBackNotices } from './embarkModel'

const unit = (key: number, entryId: string, models: number, keywords: string[], transport = false) => ({
  key,
  entryId,
  name: entryId,
  points: 80,
  group: transport ? ('transport' as const) : ('battleline' as const),
  keywords,
  toggles: [],
  size: { models, resizable: false },
  attachment: null,
  wargear: [],
  enhancements: [],
  upgrades: [],
  formationOptions: [],
  prebattleRules: [],
  ...(transport ? { transport: true } : {}),
})

const units = [
  unit(0, 'Intercessors', 5, ['Infantry']),
  unit(1, 'Captain', 1, ['Infantry', 'Character']),
  unit(2, 'Scouts', 5, ['Infantry']),
  unit(3, 'Rhino', 1, ['Vehicle', 'Transport'], true),
  unit(4, 'Predator', 1, ['Vehicle']),
]
const details = [{ entryId: 'Rhino', transportRule: 'This model has a transport capacity of 10 INFANTRY models.' }]
const picks = (choices: Partial<RosterPick>[] = []): RosterPick[] => units.map((entry, at) => ({ ...choices[at], entryId: entry.entryId }))
const cards = (choices?: Partial<RosterPick>[], from = details) => embarkCards(frozenUnits(picks(choices), units, from))
const card = (at: number, choices?: Partial<RosterPick>[]) => cards(choices).cards.get(at)!

const SQUAD_ABOARD = [{}, {}, {}, {}, {}].map((_, at) => (at === 0 ? { embarkedIn: 3 } : {}))
const LED_SQUAD_ABOARD = [{ embarkedIn: 3 }, { attachedTo: 0 }]

describe('a passenger’s card', () => {
  it('offers the roster’s transports', () => {
    expect(card(0).canBoard).toEqual([{ passenger: 0, transport: 3, name: 'Rhino', detail: '0/10 models', reason: null }])
  })

  it('offers no transport to a transport', () => {
    expect(card(3).canBoard).toEqual([])
  })

  it('leaves out a transport that can never carry it', () => {
    expect(card(4).canBoard).toEqual([])
  })

  it('says which transport it starts in', () => {
    expect(card(0, SQUAD_ABOARD).ridesIn).toEqual({ label: 'Embarked in', name: 'Rhino', action: 'Remove', passenger: 0 })
  })

  it('stops offering the transport it already starts in', () => {
    expect(card(0, SQUAD_ABOARD).canBoard).toEqual([])
  })

  it('offers boarding only from the bodyguard of an attached unit', () => {
    expect(card(1, [{}, { attachedTo: 0 }]).canBoard).toEqual([])
  })

  it('tells a joined character where its unit rides', () => {
    expect(card(1, LED_SQUAD_ABOARD).ridesIn).toEqual({ label: 'Embarked in', name: 'Rhino', action: 'Remove', passenger: 0 })
  })

  it('greys out a transport without room, with the reason', () => {
    expect(card(2, LED_SQUAD_ABOARD).canBoard[0]).toMatchObject({
      detail: '6/10 models',
      reason: 'this transport can carry at most 10 models',
    })
  })

  it('greys out a transport whose capacity cannot be read', () => {
    const unread = details.map((entry) => (entry.entryId === 'Rhino' ? { ...entry, transportRule: 'Carries some models.' } : entry))
    expect(cards([], unread).cards.get(0)!.canBoard[0]).toMatchObject({
      detail: null,
      reason: 'this transport has no known model capacity',
    })
  })
})

describe('a transport’s card', () => {
  it('offers the units that could board it', () => {
    expect(card(3).canCarry.map((choice) => choice.name)).toEqual(['Intercessors', 'Captain', 'Scouts'])
  })

  it('offers an attached unit once, by its bodyguard', () => {
    expect(card(3, [{}, { attachedTo: 0 }]).canCarry).toEqual([
      { passenger: 0, transport: 3, name: 'Intercessors', detail: 'With Captain', reason: null },
      { passenger: 2, transport: 3, name: 'Scouts', detail: null, reason: null },
    ])
  })

  it('lists an attached unit aboard once, with the room it takes', () => {
    expect(card(3, LED_SQUAD_ABOARD).carries).toEqual([
      { label: 'Embarked', name: 'Intercessors', detail: '6/10 models', action: 'Disembark', passenger: 0 },
    ])
  })

  it('names an embarked attached unit by its custom name', () => {
    expect(
      card(3, [
        { embarkedIn: 3, nickname: 'Alpha' },
        { attachedTo: 0, nickname: 'Commander' },
      ]).carries[0]?.name,
    ).toBe('Alpha · Intercessors')
  })

  it('includes custom names in boarding choices and their attached characters', () => {
    expect(card(3, [{ nickname: 'Alpha' }, { attachedTo: 0, nickname: 'Commander' }]).canCarry[0]).toMatchObject({
      name: 'Alpha · Intercessors',
      detail: 'With Commander · Captain',
    })
  })

  it('includes the transport’s custom name in its passengers’ embark rows', () => {
    expect(card(0, [{ embarkedIn: 3 }, {}, {}, { nickname: 'Ironclad' }]).ridesIn?.name).toBe('Ironclad · Rhino')
  })

  it('greys out a unit there is no room left for', () => {
    expect(card(3, LED_SQUAD_ABOARD).canCarry).toEqual([
      { passenger: 2, transport: 3, name: 'Scouts', detail: null, reason: 'this transport can carry at most 10 models' },
    ])
  })
})

describe('a card inside an attached unit’s outline', () => {
  it('leaves where the unit rides to the outline', () => {
    expect(cardEmbark(card(0, SQUAD_ABOARD), true).ridesIn).toBeUndefined()
  })

  it('leaves boarding to the outline', () => {
    expect(cardEmbark(card(0), true).canBoard).toEqual([])
  })

  it('keeps where a unit on its own rides', () => {
    expect(cardEmbark(card(0, SQUAD_ABOARD), false).ridesIn).toMatchObject({ name: 'Rhino' })
  })

  it('keeps what it carries', () => {
    expect(cardEmbark(card(3, LED_SQUAD_ABOARD), true).carries).toEqual(card(3, LED_SQUAD_ABOARD).carries)
  })
})

it('names cards as the caller numbers them', () => {
  expect(embarkCards(frozenUnits(picks(), units, details), (at) => at + 100).cards.get(100)!.canBoard[0]).toMatchObject({
    passenger: 100,
    transport: 103,
  })
})

describe('starting embarks the list can no longer hold', () => {
  const OVERFULL = [{ embarkedIn: 3 }, { attachedTo: 0 }, { embarkedIn: 3 }]

  it('names the passenger that no longer fits and its transport', () => {
    expect(cards(OVERFULL).dropped).toEqual([{ card: 2, transport: 'Rhino' }])
  })

  it('puts back the unit an edit changed rather than another passenger', () => {
    expect(embarkCards(frozenUnits(picks(OVERFULL), units, details), undefined, [1]).dropped).toEqual([{ card: 0, transport: 'Rhino' }])
  })
})

describe('edited picks', () => {
  const pick = (key: number, choices: Partial<RosterPick> = {}) => ({ key, entryId: 'Intercessors', ...choices })

  it('names a pick whose choices changed', () => {
    expect(editedPicks([pick(0), pick(1)], [pick(0), pick(1, { models: 10 })])).toEqual([1])
  })

  it('names a pick the edit added', () => {
    expect(editedPicks([pick(0)], [pick(0), pick(1, { attachedTo: 0 })])).toEqual([1])
  })

  it('does not count a changed starting embark as an edit', () => {
    expect(editedPicks([pick(0, { embarkedIn: 1 })], [pick(0)])).toEqual([])
  })
})

describe('units an edit put back on the battlefield', () => {
  const rhino = { key: 1, entryId: 'rhino' }
  const squad = { key: 2, entryId: 'squad', embarkedIn: 1, models: 10 }

  it('puts back only a unit the picks still hold embarked', () => {
    expect(putBacks([{ card: 2, transport: 'Rhino' }], [rhino, { ...squad, embarkedIn: undefined }])).toEqual([])
  })

  it('keeps the notice while the unit stands as the edit left it', () => {
    expect(standingPutBacks([{ transport: 'Rhino', pick: squad }], [rhino, { ...squad, embarkedIn: undefined }])).toHaveLength(1)
  })

  it('forgets the notice once the unit is changed again', () => {
    expect(standingPutBacks([{ transport: 'Rhino', pick: squad }], [rhino, { ...squad, embarkedIn: undefined, models: 5 }])).toEqual([])
  })

  it('says on the card why the unit left its transport', () => {
    const noticed = withPutBackNotices(new Map([[2, NO_EMBARK]]), [{ transport: 'Rhino', pick: squad }])
    expect(noticed.get(2)?.notice).toBe('No longer fits in Rhino, so it starts on the battlefield')
  })
})
