import { expect, it } from 'vitest'
import { changeLine, changeSection } from './catalogueChanges'

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
