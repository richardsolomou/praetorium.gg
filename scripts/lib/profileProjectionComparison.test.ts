import { expect, it } from 'vitest'
import { compareProfiles, compareSheetIdentities, profileChangesOutside } from './profileProjectionComparison'

function snapshot(values: { catalogueId: string; id: string; name: string; toughness?: string }[]) {
  return {
    datasheets: values.map((sheet) => ({
      ...sheet,
      faction: sheet.catalogueId,
      profiles: [
        {
          id: `${sheet.id}-profile`,
          name: sheet.name,
          type: 'Unit',
          values: sheet.toughness === undefined ? [] : [{ name: 'T', value: sheet.toughness }],
        },
      ],
    })),
  }
}

it('reports a changed value in each affected datasheet, including an unrelated faction', () => {
  const before = snapshot([
    { catalogueId: 'dark-angels', id: 'lion', name: 'Lion', toughness: '9' },
    { catalogueId: 'necrons', id: 'warriors', name: 'Warriors', toughness: '4' },
  ])
  const after = snapshot([
    { catalogueId: 'dark-angels', id: 'lion', name: 'Lion', toughness: '10' },
    { catalogueId: 'necrons', id: 'warriors', name: 'Warriors', toughness: '5' },
  ])

  expect(compareProfiles(before, after).map((change) => [change.catalogueId, change.before, change.after])).toEqual([
    ['dark-angels', '9', '10'],
    ['necrons', '4', '5'],
  ])
})

it('reports a characteristic that disappears', () => {
  const before = snapshot([{ catalogueId: 'dark-angels', id: 'lion', name: 'Lion', toughness: '9' }])
  const after = snapshot([{ catalogueId: 'dark-angels', id: 'lion', name: 'Lion' }])

  expect(compareProfiles(before, after).map((change) => [change.before, change.after])).toEqual([['9', null]])
})

it('does not pair different datasheet ids just because their names match', () => {
  const before = snapshot([{ catalogueId: 'dark-angels', id: 'old', name: 'Lion', toughness: '9' }])
  const after = snapshot([{ catalogueId: 'dark-angels', id: 'new', name: 'Lion', toughness: '10' }])

  expect(compareProfiles(before, after)).toEqual([])
})

it('reports an identity replacement even when the datasheet name is unchanged', () => {
  const before = snapshot([{ catalogueId: 'dark-angels', id: 'old', name: 'Lion', toughness: '9' }])
  const after = snapshot([{ catalogueId: 'dark-angels', id: 'new', name: 'Lion', toughness: '10' }])

  expect(compareSheetIdentities(before, after).map((change) => change.kind)).toEqual(['added', 'removed'])
})

it('flags changes outside the declared profile scope', () => {
  const before = snapshot([
    { catalogueId: 'dark-angels', id: 'lion', name: 'Lion', toughness: '9' },
    { catalogueId: 'necrons', id: 'warriors', name: 'Warriors', toughness: '4' },
  ])
  const after = snapshot([
    { catalogueId: 'dark-angels', id: 'lion', name: 'Lion', toughness: '10' },
    { catalogueId: 'necrons', id: 'warriors', name: 'Warriors', toughness: '5' },
  ])

  expect(profileChangesOutside(compareProfiles(before, after), new Set(['dark-angels'])).map((change) => change.catalogueId)).toEqual([
    'necrons',
  ])
})

it('reports one changed value when a profile prints the same characteristic twice', () => {
  const before = snapshot([{ catalogueId: 'dark-angels', id: 'lion', name: 'Lion', toughness: '9' }])
  const after = snapshot([{ catalogueId: 'dark-angels', id: 'lion', name: 'Lion', toughness: '9' }])
  before.datasheets[0]!.profiles[0]!.values.push({ name: 'T', value: '10' })
  after.datasheets[0]!.profiles[0]!.values.push({ name: 'T', value: '11' })

  expect(compareProfiles(before, after).map((change) => [change.before, change.after])).toEqual([['10', '11']])
})
