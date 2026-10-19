import { expect, it } from 'vitest'
import { rosterStartSearch } from './rosterStart'

it.each(['mission-pack', 'mission-matchup'])('keeps the bounded %s source when opening setup', (reference) => {
  expect(rosterStartSearch({ new: 'true', reference })).toEqual({ new: true, reference })
})

it('drops unknown source values', () => {
  expect(rosterStartSearch({ new: true, reference: 'private mission name' })).toEqual({ new: true })
})

it('drops source values without a setup request', () => {
  expect(rosterStartSearch({ reference: 'mission-pack' })).toEqual({})
})
