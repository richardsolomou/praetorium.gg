import { describe, expect, it } from 'vitest'
import { buildIndex, type Catalogue, type CatalogueFile } from '../core/catalogue'
import { catalogueSections } from './catalogueSections'
import { system } from './catalogue.fixtures'

const manoeuvre = (id: string, name: string, description: string) => ({
  id,
  name,
  typeName: 'Abilities',
  characteristics: [{ name: 'Description', $text: description }],
})

/** Books shelved under one faction, as the catalogues name them: `Xenos - Aeldari`. */
const sectionsOf = (...catalogues: Partial<Catalogue>[]) =>
  catalogueSections(
    buildIndex(
      [
        system,
        ...catalogues.map((catalogue, at): CatalogueFile => ({
          catalogue: { id: `cat-${at}`, name: `Xenos - Aeldari${at ? ` - Book ${at}` : ''}`, ...catalogue },
        })),
      ],
      'test-revision',
    ),
  )

const ask = (sections: ReturnType<typeof catalogueSections>, titles: string[], entry = 'Battle Focus - Agile Manoeuvres') => [
  ...sections({ faction: 'Aeldari', entry, titles }),
]

describe('a section the cards name and do not describe', () => {
  const manoeuvres: Partial<Catalogue> = {
    sharedSelectionEntries: [
      {
        id: 'manoeuvres',
        name: 'Battle Focus - Agile Manoeuvres',
        type: 'upgrade',
        profiles: [
          manoeuvre('swift', 'Swift as the wind', 'Add 2" to Move.'),
          manoeuvre('engines', 'Star Engines', 'Weapons gain [ASSAULT].'),
        ],
      },
    ],
  }

  it('reads the entry that describes the whole of it, whatever case the card titles it in', () => {
    const sections = sectionsOf(manoeuvres)
    expect(ask(sections, ['Swift as the Wind', 'Star Engines'])).toEqual([
      ['Swift as the Wind', 'Add 2" to Move.'],
      ['Star Engines', 'Weapons gain [ASSAULT].'],
    ])
  })

  it('leaves a title no one entry describes alongside the rest unanswered', () => {
    const sections = sectionsOf(manoeuvres)
    expect(ask(sections, ['Swift as the Wind', 'Fade Back'])).toEqual([])
  })

  it('answers nothing when the card and section name no entry the catalogue holds', () => {
    const sections = sectionsOf(manoeuvres)
    expect(ask(sections, ['Swift as the Wind', 'Star Engines'], 'Battle Focus - Manoeuvres')).toEqual([])
  })

  it('does not read another faction\u2019s books', () => {
    const sections = sectionsOf(manoeuvres)
    expect([...sections({ faction: 'Orks', entry: 'Battle Focus - Agile Manoeuvres', titles: ['Swift as the Wind'] })]).toEqual([])
  })

  it('does not answer from a loose profile that happens to share a name', () => {
    const sections = sectionsOf({
      ...manoeuvres,
      sharedSelectionEntries: [
        ...manoeuvres.sharedSelectionEntries!,
        {
          id: 'vyper',
          name: 'Vyper',
          type: 'model',
          profiles: [manoeuvre('upgrade', 'Star Engines', 'This model can shoot after Advancing.')],
        },
      ],
    })
    // The loose profile is not on the entry the section is named after, so it never answers.
    expect(ask(sections, ['Star Engines'])).toEqual([['Star Engines', 'Weapons gain [ASSAULT].']])
    expect(ask(sections, ['Swift as the Wind', 'Star Engines'])).toEqual([
      ['Swift as the Wind', 'Add 2" to Move.'],
      ['Star Engines', 'Weapons gain [ASSAULT].'],
    ])
  })

  it('fills nothing when two entries describe the same section differently', () => {
    const sections = sectionsOf(manoeuvres, {
      sharedSelectionEntries: [
        {
          id: 'manoeuvres-again',
          name: 'Battle Focus - Agile Manoeuvres',
          type: 'upgrade',
          profiles: [
            manoeuvre('swift-2', 'Swift as the wind', 'Add 3" to Move.'),
            manoeuvre('engines-2', 'Star Engines', 'Weapons gain [ASSAULT].'),
          ],
        },
      ],
    })
    expect(ask(sections, ['Swift as the Wind', 'Star Engines'])).toEqual([['Star Engines', 'Weapons gain [ASSAULT].']])
  })
})
