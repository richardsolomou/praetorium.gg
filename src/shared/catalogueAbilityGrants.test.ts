import { expect, it } from 'vitest'
import { parsedAbilityGrants } from './catalogueAbilityGrants'

it('gives a bodyguard’s Feel No Pain to the leader its words name', () =>
  expect(
    parsedAbilityGrants(
      'While a CYBERNETICA DATASMITH model is leading this unit, that model has the Feel No Pain 4+ ability.',
      true,
      [],
      true,
      ['Cybernetica Datasmith'],
    ),
  ).toEqual([{ name: 'Feel No Pain 4+', recipient: 'leader' }]))
