import { expect, it } from 'vitest'
import { changeLine, changeSection, changeTally } from './catalogueChanges'

const enhancement = { detachmentId: 'gladius', detachment: 'Gladius Task Force', name: 'Artificer Armour', upgrade: false }

it('names a single-row datasheet by its price alone', () => {
  expect(
    changeLine({
      kind: 'datasheet-points',
      id: 'captain',
      name: 'Captain',
      rows: [{ models: null, condition: null, from: '80', to: '90' }],
    }),
  ).toBe('Captain 80 → 90 pts')
})

it('names each changed size of a datasheet that prints several', () => {
  expect(
    changeLine({
      kind: 'datasheet-points',
      id: 'intercessors',
      name: 'Intercessor Squad',
      rows: [
        { models: '5', condition: null, from: '80', to: '90' },
        { models: '10', condition: 'Gladius Task Force', from: '150', to: null },
      ],
    }),
  ).toBe('Intercessor Squad 5 models 80 → 90 pts, 10 models (Gladius Task Force) 150 → — pts')
})

it('lists every price of a size priced several ways without pairing them', () => {
  expect(
    changeLine({
      kind: 'datasheet-points',
      id: 'blade-champion',
      name: 'Blade Champion',
      rows: [
        { models: '1', condition: null, from: '110', to: null },
        { models: '1', condition: null, from: '125', to: null },
        { models: '1', condition: null, from: null, to: '175' },
        { models: '1', condition: null, from: null, to: '195' },
      ],
    }),
  ).toBe('Blade Champion 1 model 110 / 125 → 175 / 195 pts')
})

it('counts an update’s changes by what happened to what', () => {
  expect(
    changeTally([
      { kind: 'datasheet-added', id: 'a', name: 'A' },
      { kind: 'datasheet-added', id: 'b', name: 'B' },
      { kind: 'enhancement-added', ...enhancement, upgrade: true },
      { kind: 'detachment-points', id: 'gladius', name: 'Gladius Task Force', from: '2', to: '3' },
    ]),
  ).toEqual(['2 datasheets added', '1 detachment repriced', '1 upgrade added'])
})

it('counts a varied update by section alone', () => {
  expect(
    changeTally([
      { kind: 'datasheet-added', id: 'a', name: 'A' },
      { kind: 'datasheet-removed', id: 'b', name: 'B' },
      { kind: 'detachment-added', id: 'c', name: 'C' },
      { kind: 'detachment-removed', id: 'd', name: 'D' },
    ]),
  ).toEqual(['2 datasheets', '2 detachments changed'])
})

it('names a detachment change in detachment points', () => {
  expect(changeLine({ kind: 'detachment-points', id: 'gladius', name: 'Gladius Task Force', from: '2', to: '3' })).toBe(
    'Gladius Task Force 2 → 3 DP',
  )
})

it('names an enhancement with the detachment that offers it', () => {
  expect(changeLine({ kind: 'enhancement-points', ...enhancement, from: '10', to: '15' })).toBe(
    'Artificer Armour (Gladius Task Force) 10 → 15 pts',
  )
})

it('says a removed datasheet was removed', () => {
  expect(changeLine({ kind: 'datasheet-removed', id: 'intercessors', name: 'Intercessor Squad' })).toBe('Intercessor Squad removed')
})

it('files an upgrade apart from enhancements', () => {
  expect(changeSection({ kind: 'enhancement-added', ...enhancement, upgrade: true })).toBe('Upgrades')
})
