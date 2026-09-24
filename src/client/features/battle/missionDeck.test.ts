import { describe, expect, it } from 'vitest'
import { missionCardsByKey, primaryCards, secondaryCards } from './missionDeck'

type References = Parameters<typeof primaryCards>[0]

const card = (key: string) => ({ key, name: key, text: null, awards: [], whenDrawn: null })
const pack = (id: string, missionCards: (ReturnType<typeof card> | null)[]) => ({
  id,
  name: id,
  twists: [],
  missions: missionCards.map((entry, at) => ({ id: `${id}-${at}`, card: entry })),
})

const references = (packs: ReturnType<typeof pack>[], secondaries: ReturnType<typeof card>[] = []) =>
  ({ packs, secondaries }) as unknown as References

describe('the mission deck', () => {
  it('gathers the primaries the packs print', () => {
    const deck = primaryCards(references([pack('chapter-approved', [card('take-and-hold'), card('death-trap')])]))

    expect(deck.map((entry) => entry.key)).toEqual(['take-and-hold', 'death-trap'])
  })

  // The same card is printed by more than one pack, and a battle plays one of it.
  it('holds a card two packs print once', () => {
    const deck = primaryCards(
      references([pack('chapter-approved', [card('take-and-hold')]), pack('combat-patrol', [card('take-and-hold')])]),
    )

    expect(deck.map((entry) => entry.key)).toEqual(['take-and-hold'])
  })

  it('skips a mission whose card the source does not carry', () => {
    expect(primaryCards(references([pack('chapter-approved', [null, card('death-trap')])])).map((entry) => entry.key)).toEqual([
      'death-trap',
    ])
  })

  // An instance with nothing synced answers with no references at all, which is a deck
  // of no cards rather than a screen that throws.
  it('reads an unsynced instance as an empty deck', () => {
    expect(primaryCards(undefined)).toEqual([])
    expect(secondaryCards(undefined)).toEqual([])
  })

  it('takes the secondaries as the references give them', () => {
    expect(secondaryCards(references([], [card('assassination')])).map((entry) => entry.key)).toEqual(['assassination'])
  })

  it('indexes primary and secondary cards for battle references', () => {
    expect([...missionCardsByKey(references([pack('chapter-approved', [card('take-and-hold')])], [card('assassination')])).keys()]).toEqual(
      ['take-and-hold', 'assassination'],
    )
  })
})
