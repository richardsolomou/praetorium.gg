import { expect, it } from 'vitest'
import type { Catalogue } from '../core/catalogue'
import { datasheetIn } from '../shared/catalogue'
import { ability, bookOf } from './catalogue.fixtures'
import { withoutAbsentAbilities } from './absentAbilities'

const catalogue = (): Partial<Catalogue> => ({
  sharedProfiles: [ability('rage', 'Black Rage')],
  selectionEntries: [
    {
      id: 'ancient',
      name: 'Ancient',
      type: 'model',
      profiles: [ability('banner', 'Astartes Banner')],
      infoLinks: [{ id: 'rage-ancient', targetId: 'rage', name: 'Black Rage', type: 'profile' }],
    },
    {
      id: 'captain',
      name: 'Captain',
      type: 'model',
      infoLinks: [{ id: 'rage-captain', targetId: 'rage', name: 'Black Rage', type: 'profile' }],
    },
  ],
})
const version = (absent: readonly (readonly [string, string])[], named: readonly (readonly [string, string])[] = []) => {
  const [file] = withoutAbsentAbilities([{ catalogue: { id: 'cat', name: 'Test catalogue', ...catalogue() } }], absent, named)
  const book = bookOf(file!.catalogue!)
  return (id: string) => datasheetIn(book, 'cat', id)?.abilities.map((shown) => shown.name)
}

it('hides an ability on the datasheet a rules version marks it absent from, own or shared', () =>
  expect(
    version([
      ['ancient', 'banner'],
      ['ancient', 'rage'],
    ])('ancient'),
  ).toEqual([]))

it('keeps a shared ability on another datasheet that prints it', () =>
  expect(version([['ancient', 'rage']])('captain')).toEqual(['Black Rage']))

it('hides an ability marked absent by name where it has no BSData alias, own or shared', () =>
  expect(
    version(
      [],
      [
        ['ancient', 'astarte-banner'],
        ['ancient', 'black-rage'],
      ],
    )('ancient'),
  ).toEqual([]))

it('keeps an ability marked absent by name on another datasheet that prints it', () =>
  expect(version([], [['ancient', 'black-rage']])('captain')).toEqual(['Black Rage']))

it('keeps the ability on a rules version that does not mark it absent', () =>
  expect(version([])('ancient')).toEqual(['Astartes Banner', 'Black Rage']))

it('leaves the files another rules version shares untouched', () => {
  const shared = { catalogue: { id: 'cat', name: 'Test catalogue', ...catalogue() } }
  const before = JSON.stringify(shared)
  withoutAbsentAbilities([shared], [['ancient', 'banner']])
  expect(JSON.stringify(shared)).toBe(before)
})
