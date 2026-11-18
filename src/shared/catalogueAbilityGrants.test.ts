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

it.each([
  'The bearer’s unit has the **^^Markerlight^^** keyword and can act as an Observer unit for another unit even if it Advanced this turn.',
  'This model has a transport capacity of 12 Adeptus Astartes Infantry models. Each Gravis model takes up the space of 2 models.',
  'This unit has +1 to hazard rolls made for its Plasma Incinerator and Plasma Pistol weapons.',
  'The bearer’s unit has both abilities from the Tyrannical Motivation Detachment rule.',
  'This model has the **psychic abilities** listed in the Psychic Abilities section.',
])('reads no named ability from %s', (text) => expect(parsedAbilityGrants(text, false, [], true)).toEqual([]))

it('ends a granted ability at the clause after it', () =>
  expect(
    parsedAbilityGrants(
      'Models in this unit have the Feel No Pain 6+ ability and you can re-roll failed Out of Action tests taken for this unit.',
      false,
      [],
      true,
    ),
  ).toEqual([{ name: 'Feel No Pain 6+', recipient: 'unit' }]))

it('keeps the attacks a granted ability is limited to apart from its name', () =>
  expect(
    parsedAbilityGrants('This model has the Feel No Pain 4+ ability against mortal wounds and Psychic Attacks.', false, [], true),
  ).toEqual([{ name: 'Feel No Pain 4+', recipient: 'bearer', condition: 'against mortal wounds and Psychic Attacks' }]))

it('names a grant by its own words, not an unrelated rule its datasheet links', () =>
  expect(parsedAbilityGrants('Models in this unit have the Feel No Pain 4+ ability.', false, ['For The Greater Good'], true)).toEqual([
    { name: 'Feel No Pain 4+', recipient: 'unit' },
  ]))
