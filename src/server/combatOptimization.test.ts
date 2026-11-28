import { expect, it } from 'vitest'
import type { SelectionEntry } from '../core/catalogue'
import { DEFAULT_COMBAT_OPTIONS } from '../core/combat'
import { applyOptimizedLoadout, loadoutChanges, optimizeLoadout, type LoadoutCandidate } from '../core/combatLoadouts'
import { bookOf, points } from './catalogue.fixtures'
import { combatLoadoutCandidates, combatLoadoutSpace, loadoutStates, withoutEmptyEntries } from '../shared/combatLoadouts'
import { rosterCombatant } from '../shared/rosterCombatRules'
import { vsRosterData } from '../shared/vsDataLegality'

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
  const rebuilt = rosterCombatant(book, null, { ...request, picks: applyOptimizedLoadout(request.picks, optimized.best!.picks) })!
  expect(
    [rebuilt.carriers, ...rebuilt.companions.map((member) => member.carriers)].map((carriers) => carriers[0]!.weapons[0]!.name),
  ).toEqual(['Squad strong', 'Leader strong', 'Support strong'])
  expect(optimized.best!.result.meanDamage).toBeCloseTo((3 * 5) / 6, 12)
})

const banner = (id: string, cost: number) => ({
  id: `${id}-group`,
  name: id,
  constraints: [{ id: `${id}-max`, type: 'max' as const, field: 'selections', scope: 'parent', value: 1 }],
  selectionEntries: [
    {
      id,
      name: id,
      type: 'upgrade' as const,
      costs: points(cost),
      profiles: [{ id: `${id}-ability`, name: id, typeName: 'Abilities', characteristics: [{ name: 'Description', $text: 'Inspiring.' }] }],
    },
  ],
})
const bannerSquad = unit('squad', 'Squad')
const bannered = bookOf({
  selectionEntries: [
    { ...bannerSquad, selectionEntryGroups: [...bannerSquad.selectionEntryGroups!, banner('free', 0), banner('paid', 10)] },
  ],
})

it.each([
  ['takes a free addition but not a paid one', {}, { 'free-group': 'free' }],
  ['adds a free addition beside a paid one already taken', { 'paid-group': 'paid' }, { 'paid-group': 'paid', 'free-group': 'free' }],
  [
    'keeps a paid addition beside a free one already taken',
    { 'paid-group': 'paid', 'free-group': 'free' },
    { 'paid-group': 'paid', 'free-group': 'free' },
  ],
])('%s when the result cannot tell them apart', async (_, banners, expected) => {
  const data = {
    catalogueId: 'cat',
    detachmentIds: [],
    pickIndex: 0,
    picks: [{ entryId: 'squad', choices: { 'squad-weapons': 'squad-strong', ...banners } }],
  }
  const found: LoadoutCandidate[] = []
  for await (const batch of combatLoadoutCandidates(bannered, data, new AbortController().signal)) found.push(...batch.candidates)
  const current = rosterCombatant(bannered, null, data)!
  // Reversed, so the starting loadout is met last, as the site's workers can return it.
  const optimized = optimizeLoadout(
    { candidates: found.map((candidate) => ({ ...candidate, changes: loadoutChanges(candidate, found[0]!) })).toReversed() },
    {
      sheet: current.selected,
      models: 1,
      rules: [],
      opponent: { keywords: [], rules: [] },
      preferences: {},
      excluded: { ranged: [], melee: [] },
      phases: { ranged: { target, options: DEFAULT_COMBAT_OPTIONS, adjustment: {} }, melee: null },
    },
    'ranged',
  )
  expect(optimized.best!.picks[0]!.pick.choices).toEqual({ 'squad-weapons': 'squad-strong', ...expected })
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
  expect(optimized.best!.result.meanDamage).toBeCloseTo((3 * 35) / 36, 12)
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

it('projects each candidate as the roster would project its loadout from scratch', async () => {
  for (const candidate of await candidates()) {
    const updates = new Map(candidate.members.map((member) => [member.pickIndex, member.pick]))
    const roster = request.picks.map((pick, pickIndex) => updates.get(pickIndex) ?? pick)
    const projected = rosterCombatant(book, null, { ...request, picks: roster })!
    expect(candidate.members.map(({ sheet, carriers, rules }) => ({ sheet, carriers, rules }))).toEqual([
      { sheet: projected.selected, carriers: projected.carriers, rules: projected.rules },
      ...projected.companions.map((companion) => ({ sheet: companion.selected, carriers: companion.carriers, rules: companion.rules })),
    ])
  }
})

it('offers leaders and bodyguards to the simulator but not to a loadout search', () => {
  const alone = { ...request, picks: [{ entryId: 'squad' }] }
  expect({
    simulator: rosterCombatant(book, null, alone)!.attachmentOptions.length > 0,
    search: rosterCombatant(book, null, alone, undefined, { attachmentChoices: false })!.attachmentOptions,
  }).toEqual({ simulator: true, search: [] })
})

it('estimates a search by the loadouts its unit’s weapon choices allow', async () => {
  const batches = []
  for await (const batch of combatLoadoutCandidates(book, request, new AbortController().signal)) batches.push(batch)
  // Squad, leader and support each choose between a strong and a weak weapon.
  expect(batches[0]!.estimated).toBe(8)
})

it('searches every loadout when the unit allows few enough', async () => {
  const batches = []
  for await (const batch of combatLoadoutCandidates(book, request, new AbortController().signal)) batches.push(batch)
  expect(batches.map((batch) => batch.local)).not.toContain(true)
})

it('searches only the loadouts one edit from a random walk’s legal start', async () => {
  const batches = []
  const walk = { seed: 7, steps: 2 }
  for await (const batch of combatLoadoutCandidates(book, { ...request, walk }, new AbortController().signal)) batches.push(batch)
  const weapons = batches.flatMap((batch) =>
    batch.candidates.map((candidate) => candidate.members.map((member) => member.carriers[0]!.weapons[0]!.name)),
  )
  const [start, ...near] = weapons
  expect({
    local: batches.every((batch) => batch.local),
    edits: near.map((loadout) => loadout.filter((weapon, at) => weapon !== start![at]).length),
  }).toEqual({ local: true, edits: [1, 1, 1] })
})

it('counts the ways a squad can split a weapon choice among its models', () => {
  const option = (id: string, count: number, max: number) => ({ id, count, min: 0, max, mutableMin: false })
  const split = {
    key: 'split',
    name: 'Special weapons',
    room: 3,
    uniform: false,
    optional: true,
    options: [option('a', 0, 2), option('b', 0, 3)],
  }
  // Totals of 0 to 3 with at most 2 of a: 1 + 2 + 3 + 3.
  expect(loadoutStates([split as never])).toBe(9)
})

it('keys a trimmed request’s loadout as the same state as one requested exactly', () => {
  const weapon = (id: string, count: number) => ({ id, count })
  const trimmed = { id: 'squad', count: 1, selections: [{ id: 'model', count: 5, selections: [weapon('bolter', 5), weapon('melta', 0)] }] }
  expect(withoutEmptyEntries(trimmed)).toEqual({
    id: 'squad',
    count: 1,
    selections: [{ id: 'model', count: 5, selections: [weapon('bolter', 5)] }],
  })
})

const vsRecord = (name: string, data: Record<string, unknown>) => ({ name, data: { formatVersion: 2, ...data } })
// The squad as VS Data fields it: its one model carries the weak weapon, and an option swaps it for the strong one. The
// pair's two models may each swap a blade for an axe, all of them or none.
const pair: SelectionEntry = {
  id: 'pair',
  name: 'Pair',
  type: 'unit',
  profiles: [
    {
      id: 'pair-stats',
      name: 'Pair',
      typeName: 'Unit',
      characteristics: Object.entries({ T: '4', Sv: '3+', W: '2' }).map(([stat, $text]) => ({ name: stat, $text })),
    },
  ],
  selectionEntries: [
    {
      id: 'pair-model',
      name: 'Pair',
      type: 'model',
      constraints: [
        { id: 'pair-min', type: 'min', field: 'selections', scope: 'parent', value: 2 },
        { id: 'pair-max', type: 'max', field: 'selections', scope: 'parent', value: 2 },
      ],
    },
  ],
}
const vsBook = {
  ...bookOf({ selectionEntries: [unit('squad', 'Squad'), pair] }),
  vsRoster: vsRosterData(
    {
      release: 'test',
      rulesVersion: { edition: '11th', update: 'test' },
      unavailable: [],
      points: [],
      definitions: {
        faction: { host: vsRecord('Host', {}) },
        detachment: { 'host.guard': vsRecord('Guard', { faction: 'host' }) },
        unit: {
          'host.squad': vsRecord('Squad', { faction: 'host', keywords: [], sizes: [1] }),
          'host.pair': vsRecord('Pair', { faction: 'host', keywords: [], sizes: [2] }),
        },
        model: {
          'host.squad.model': vsRecord('Squad', { unit: 'host.squad', min: 1, max: 1, wargear: { 'host.squad.weak': 1 } }),
          'host.pair.model': vsRecord('Pair', { unit: 'host.pair', min: 2, max: 2, wargear: { 'host.pair.blade': 1 } }),
        },
        'roster-option': {
          'host.squad.weapon': vsRecord('Weapon', {
            unit: 'host.squad',
            carrier: 'host.squad.model',
            per: 'carrier',
            choose: { min: 0, max: 1 },
            replaces: { 'host.squad.weak': 1 },
            choices: ['host.squad.strong'],
          }),
          'host.pair.weapon': vsRecord('Weapon', {
            unit: 'host.pair',
            carrier: 'host.pair.model',
            per: 'carrier',
            choose: { min: 0, max: 1 },
            uniform: true,
            replaces: { 'host.pair.blade': 1 },
            choices: ['host.pair.axe'],
          }),
        },
        wargear: {
          'host.squad.weak': vsRecord('Squad weak', {}),
          'host.squad.strong': vsRecord('Squad strong', {}),
          'host.pair.blade': vsRecord('Pair blade', {}),
          'host.pair.axe': vsRecord('Pair axe', {}),
        },
      },
    },
    { books: { cat: 'host' }, detachments: {}, units: { squad: 'host.squad', pair: 'host.pair' }, enhancements: {} },
    null,
    (id) => ({ squad: 'Squad', pair: 'Pair' })[id],
  ),
}
const vsRequest = { catalogueId: 'cat', detachmentIds: [], pickIndex: 0, picks: [{ entryId: 'squad', vs: { models: {}, options: {} } }] }

it('searches a VS pick’s own options, not its catalogue choices', async () => {
  const found = []
  for await (const batch of combatLoadoutCandidates(vsBook, vsRequest, new AbortController().signal)) found.push(...batch.candidates)
  expect(found.map((candidate) => JSON.stringify(candidate.members[0]!.pick.vs?.options)).toSorted()).toEqual([
    '{"host.squad.weapon":{"host.squad.strong":1}}',
    '{}',
  ])
})

it('keeps the VS Data loadout an optimised VS pick holds', () => {
  const best = { ...vsRequest.picks[0]!, vs: { models: {}, options: { 'host.squad.weapon': { 'host.squad.strong': 1 } } } }
  expect(applyOptimizedLoadout(vsRequest.picks, [{ pickIndex: 0, pick: best }])[0]!.vs).toEqual(best.vs)
})

it('fights each VS candidate with what VS Data fields for it', async () => {
  const found = []
  for await (const batch of combatLoadoutCandidates(vsBook, vsRequest, new AbortController().signal)) found.push(...batch.candidates)
  const strong = found.find((candidate) => candidate.members[0]!.pick.vs?.options['host.squad.weapon'])
  expect(strong?.members[0]!.carriers.flatMap((carrier) => carrier.weapons.map((weapon) => weapon.name))).toEqual(['Squad strong'])
})

it('counts a VS option that swaps wargear as a change, not free wargear', async () => {
  const found = []
  for await (const batch of combatLoadoutCandidates(vsBook, vsRequest, new AbortController().signal)) found.push(...batch.candidates)
  expect(found.find((candidate) => candidate.members[0]!.pick.vs?.options['host.squad.weapon'])?.freeAdditions).toBe(0)
})

it('steps a uniform VS option back to untaken', async () => {
  const taken = { ...vsRequest, picks: [{ entryId: 'pair', vs: { models: {}, options: { 'host.pair.weapon': { 'host.pair.axe': 2 } } } }] }
  const found = []
  for await (const batch of combatLoadoutCandidates(vsBook, taken, new AbortController().signal)) found.push(...batch.candidates)
  expect(found.map((candidate) => JSON.stringify(candidate.members[0]!.pick.vs?.options)).toSorted()).toEqual([
    '{"host.pair.weapon":{"host.pair.axe":2}}',
    '{}',
  ])
})

it('fields each of a VS pick’s weapon options with what VS Data fields for it', () => {
  const strong = combatLoadoutSpace(vsBook, vsRequest)
    ?.choices.flat()
    .find((option) => option.entry === 'host.squad.strong')
  expect(strong?.carriers.flatMap((carrier) => carrier.weapons.map((weapon) => weapon.name))).toEqual(['Squad strong'])
})
