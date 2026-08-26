import { describe, expect, it } from 'vitest'
import { bookOf, card, points, withCards } from './catalogue.fixtures'
import { datacardJoinReport, datacardOf } from './datasheetJoin'

const book = () =>
  bookOf({
    selectionEntries: [
      { id: 'ctan', name: "Transcendent C'tan", type: 'model', costs: points(295) },
      { id: 'rhino', name: 'Rhino', type: 'model', costs: points(75) },
      { id: 'walker', name: 'Plague Walker', type: 'model', costs: points(100) },
    ],
  })

describe('the join from a datasheet to its card', () => {
  it("reads the book's own file first, apostrophes folded", () => {
    const loaded = book()
    loaded.factionContents.set('test-catalogue', withCards('Test catalogue', new Map([['Transcendent C’tan', card({ baseSize: '80mm' })]])))
    loaded.factionContents.set('other', withCards('Other', new Map([['Transcendent C’tan', card({ baseSize: '60mm' })]])))

    expect(datacardOf(loaded, 'cat', 'ctan')).toEqual({ details: card({ baseSize: '80mm' }), own: true })
  })

  it('takes another file’s card when every file that prints the name agrees', () => {
    const loaded = book()
    loaded.factionContents.set('test-catalogue', withCards('Test catalogue', []))
    loaded.factionContents.set('one', withCards('One', new Map([['Rhino', card({ transport: 'Twelve models.' })]])))
    loaded.factionContents.set('two', withCards('Two', new Map([['Rhino', card({ transport: 'Twelve models.' })]])))

    expect(datacardOf(loaded, 'cat', 'rhino')).toEqual({ details: card({ transport: 'Twelve models.' }), own: false })
  })

  it('leaves a name the files disagree on unjoined', () => {
    const loaded = book()
    loaded.factionContents.set('one', withCards('One', new Map([['Rhino', card({ transport: 'Twelve models.' })]])))
    loaded.factionContents.set('two', withCards('Two', new Map([['Rhino', card({ transport: 'Ten models.' })]])))

    expect(datacardOf(loaded, 'cat', 'rhino')).toBeNull()
  })

  it('forgives a trailing plural', () => {
    const loaded = book()
    loaded.factionContents.set('test-catalogue', withCards('Test catalogue', ['Plague Walkers']))

    expect(datacardOf(loaded, 'cat', 'walker')?.own).toBe(true)
  })

  it('names every datasheet and card the join could not carry across', () => {
    const loaded = book()
    loaded.factionContents.set('test-catalogue', withCards('Test catalogue', ['Rhino', 'Land Raider']))

    expect(datacardJoinReport(loaded, () => true)).toEqual({
      catalogueOnly: [
        { faction: 'Test catalogue', name: "Transcendent C'tan" },
        { faction: 'Test catalogue', name: 'Plague Walker' },
      ],
      datacardsOnly: [{ faction: 'Test catalogue', name: 'Land Raider' }],
    })
  })
})
