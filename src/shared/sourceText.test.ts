import { expect, it } from 'vitest'
import { textToken, withTextPointers, type TextLocations, type TextPointer } from './sourceText'

const url = 'https://raw.githubusercontent.com/owner/data/0000000000000000000000000000000000000000/units.json'
const token = textToken({ file: '0000000a', transform: 'prose', hash: '1'.repeat(16) })
const locations = (held: string[]): TextLocations => ({
  files: { '0000000a': { url, source: 'bsdata' } },
  holds: (_, id) => held.includes(id),
})

it('points a record that lost text at its upstream file and record', () => {
  expect(withTextPointers({ id: 'ability-1', name: 'Ability', description: token }, locations(['ability-1']))).toEqual({
    id: 'ability-1',
    name: 'Ability',
    description: '',
    textSources: [{ source: 'bsdata', url, id: 'ability-1' }],
  })
})

it('points by file alone when the file holds no record by that id', () => {
  expect((withTextPointers({ id: 'elsewhere', description: token }, locations([])) as { textSources?: TextPointer[] }).textSources).toEqual(
    [{ source: 'bsdata', url }],
  )
})

it('leaves a record that lost no text as it was', () => {
  expect(withTextPointers({ id: 'unit', name: 'Unit' }, locations(['unit']))).toEqual({ id: 'unit', name: 'Unit' })
})
