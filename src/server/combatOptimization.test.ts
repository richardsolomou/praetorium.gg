import { expect, it } from 'vitest'
import type { SelectionEntry } from '../core/catalogue'
import { DEFAULT_COMBAT_OPTIONS } from '../core/combat'
import { applyOptimizedLoadout, optimizeLoadout } from '../core/combatLoadouts'
import { bookOf } from './catalogue.fixtures'
import { combatLoadoutCandidates } from './combatLoadouts'
import { rosterCombatant } from './rosterCombatRules'

function unit(id: string, name: string, kind?: 'Leader' | 'Support'): SelectionEntry {
  return {
    id,
    name,
    type: 'model',
    profiles: [
      {
        id: `${id}-stats`,
        name,
        typeName: 'Unit',
        characteristics: Object.entries({ T: '4', Sv: '3+', W: '2' }).map(([stat, $text]) => ({ name: stat, $text })),
      },
      ...(kind
        ? [
            {
              id: `${id}-attachment`,
              name: kind,
              typeName: 'Abilities',
              characteristics: [{ name: 'Description', $text: 'This model can be attached to the following units:\n■ Squad' }],
            },
          ]
        : []),
      ...(kind === 'Leader'
        ? [
            {
              id: `${id}-accuracy`,
              name: 'Accuracy',
              typeName: 'Abilities',
              characteristics: [
                {
                  name: 'Description',
                  $text: 'While this model is leading a unit, each time a model in that unit makes an attack, re-roll a Hit roll of 1.',
                },
              ],
            },
          ]
        : []),
    ],
    selectionEntryGroups: [
      {
        id: `${id}-weapons`,
        name: 'Weapons',
        defaultSelectionEntryId: `${id}-weak`,
        constraints: [
          { id: `${id}-min`, type: 'min', field: 'selections', scope: 'parent', value: 1 },
          { id: `${id}-max`, type: 'max', field: 'selections', scope: 'parent', value: 1 },
        ],
        selectionEntries: ['weak', 'strong'].map((weapon, index) => ({
          id: `${id}-${weapon}`,
          name: `${name} ${weapon}`,
          type: 'upgrade',
          profiles: [
            {
              id: `${id}-${weapon}-profile`,
              name: `${name} ${weapon}`,
              typeName: 'Ranged Weapons',
              characteristics: Object.entries({ Range: '24"', A: '1', BS: '2+', S: '4', AP: '0', D: String(index + 1) }).map(
                ([stat, $text]) => ({ name: stat, $text }),
              ),
            },
          ],
        })),
      },
    ],
  }
}

const book = bookOf({
  selectionEntries: [
    unit('squad', 'Squad'),
    unit('leader', 'Leader', 'Leader'),
    unit('support', 'Support', 'Support'),
    unit('other', 'Other'),
  ],
})
const request = {
  catalogueId: 'cat',
  detachmentIds: [],
  pickIndex: 0,
  picks: [{ entryId: 'squad' }, { entryId: 'leader', attachedTo: 0 }, { entryId: 'support', attachedTo: 0 }, { entryId: 'other' }],
}
const target = { groups: [{ models: 1, toughness: 4, save: 7, wounds: 50, invulnerable: null }], feelNoPain: null }

async function candidates(data = request) {
  const found = []
  for await (const batch of combatLoadoutCandidates(book, data, new AbortController().signal)) found.push(...batch.candidates)
  return found
}

it('discovers every squad, leader and support weapon combination together', async () => {
  expect(
    (await candidates()).map((candidate) => candidate.members.map((member) => member.carriers[0]!.weapons[0]!.name).join(',')).toSorted(),
  ).toEqual([
    'Squad strong,Leader strong,Support strong',
    'Squad strong,Leader strong,Support weak',
    'Squad strong,Leader weak,Support strong',
    'Squad strong,Leader weak,Support weak',
    'Squad weak,Leader strong,Support strong',
    'Squad weak,Leader strong,Support weak',
    'Squad weak,Leader weak,Support strong',
    'Squad weak,Leader weak,Support weak',
  ])
})

it('applies the best complete loadout and reproduces its scored attacks after rebuilding', async () => {
  const current = rosterCombatant(book, null, request)!
  const optimized = optimizeLoadout(
    { candidates: await candidates() },
    {
      sheet: current.selected,
      models: 1,
      rules: [],
      ruleChoices: { 'Leader:Accuracy': 0 },
      opponent: { keywords: [], rules: [] },
      preferences: {},
      excluded: { ranged: [], melee: [] },
      phases: {
        ranged: { target, options: DEFAULT_COMBAT_OPTIONS, adjustment: {} },
        melee: { target, options: { ...DEFAULT_COMBAT_OPTIONS, phase: 'melee' }, adjustment: {} },
      },
    },
  )
  const rebuilt = rosterCombatant(book, null, { ...request, picks: applyOptimizedLoadout(request.picks, optimized.picks) })!
  expect(
    [rebuilt.carriers, ...rebuilt.companions.map((member) => member.carriers)].map((carriers) => carriers[0]!.weapons[0]!.name),
  ).toEqual(['Squad strong', 'Leader strong', 'Support strong'])
  expect(optimized.result.meanDamage).toBeCloseTo((3 * 5) / 6, 12)
})

it('includes the bodyguard and sibling support when optimizing from a selected leader', async () => {
  expect((await candidates({ ...request, pickIndex: 1 }))[0]!.members.map((member) => member.pickIndex)).toEqual([1, 0, 2])
})

it('scores every member with the player’s selected shared buff', async () => {
  const current = rosterCombatant(book, null, request)!
  const optimized = optimizeLoadout(
    { candidates: await candidates() },
    {
      sheet: current.selected,
      models: 1,
      rules: [],
      ruleChoices: { 'Leader:Accuracy': 1 },
      opponent: { keywords: [], rules: [] },
      preferences: {},
      excluded: { ranged: [], melee: [] },
      phases: {
        ranged: { target, options: DEFAULT_COMBAT_OPTIONS, adjustment: {} },
        melee: { target, options: { ...DEFAULT_COMBAT_OPTIONS, phase: 'melee' }, adjustment: {} },
      },
    },
  )
  expect(optimized.result.meanDamage).toBeCloseTo((3 * 35) / 36, 12)
})

it('leaves unrelated units and attachment identities unchanged when applying a result', () => {
  const picks = request.picks.map((pick, key) => ({ ...pick, key }))
  const changed = applyOptimizedLoadout(picks, [
    { pickIndex: 1, pick: { entryId: 'leader', choices: { 'leader-weapons': 'leader-strong' } } },
  ])
  expect(changed).toEqual([
    picks[0],
    { ...picks[1], choices: { 'leader-weapons': 'leader-strong' }, spreads: undefined },
    picks[2],
    picks[3],
  ])
})

it('stops discovery without emitting candidates after cancellation', async () => {
  const controller = new AbortController()
  const search = combatLoadoutCandidates(book, request, controller.signal)
  await search.next()
  controller.abort()
  expect(await search.next()).toEqual({ done: true, value: undefined })
})

it('keeps an attached character’s enhancement and every member’s model count fixed', async () => {
  const leader = unit('leader', 'Leader', 'Leader')
  leader.selectionEntryGroups!.push({
    id: 'enhancements',
    name: 'Enhancements',
    defaultSelectionEntryId: 'first',
    constraints: [
      { id: 'enhancement-min', type: 'min', field: 'selections', scope: 'parent', value: 1 },
      { id: 'enhancement-max', type: 'max', field: 'selections', scope: 'parent', value: 1 },
    ],
    selectionEntries: [
      { id: 'first', name: 'First enhancement', type: 'upgrade' },
      { id: 'second', name: 'Second enhancement', type: 'upgrade' },
    ],
  })
  const enhancedBook = bookOf({ selectionEntries: [unit('squad', 'Squad'), leader] })
  const data = {
    ...request,
    picks: [
      { entryId: 'squad', models: 1 },
      { entryId: 'leader', attachedTo: 0, choices: { enhancements: 'second' } },
    ],
  }
  const found = []
  for await (const batch of combatLoadoutCandidates(enhancedBook, data, new AbortController().signal)) found.push(...batch.candidates)
  expect(
    found.map(({ members }) => ({ models: members.map((member) => member.models), enhancement: members[1]!.pick.choices?.enhancements })),
  ).toEqual(Array.from({ length: 4 }, () => ({ models: [1, 1], enhancement: 'second' })))
})

it('refuses an illegal starting attachment instead of optimizing a partial unit', async () => {
  await expect(candidates({ ...request, picks: [{ entryId: 'squad' }, { entryId: 'other', attachedTo: 0 }] })).rejects.toThrow(
    'The attached unit could not be evaluated legally.',
  )
})
