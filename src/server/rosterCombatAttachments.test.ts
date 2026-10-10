import { expect, it } from 'vitest'
import { bookOf, categories } from './catalogue.fixtures'
import type { LoadedRules } from './rules'
import { rosterCombatant } from '../shared/rosterCombatRules'
import { combatRuleChoices } from '../core/combatRules'

const profile = (id: string, name: string, typeName: string, values: Record<string, string>) => ({
  id,
  name,
  typeName,
  characteristics: Object.entries(values).map(([characteristic, $text]) => ({ name: characteristic, $text })),
})
const unit = (id: string, name: string, ability?: { kind: string; text: string }) => ({
  id,
  name,
  type: 'model' as const,
  profiles: [
    profile(`${id}-stats`, name, 'Unit', { T: '4', Sv: '3+', W: '2' }),
    profile(`${id}-weapon`, 'Rifle', 'Ranged Weapons', { A: '1', BS: '3+', S: '4', AP: '0', D: '1' }),
    ...(ability ? [profile(`${id}-attachment`, ability.kind, 'Abilities', { Description: ability.text })] : []),
  ],
})
const loaded = bookOf({
  selectionEntries: [
    {
      ...unit('squad', 'Squad'),
      profiles: [
        ...unit('squad', 'Squad').profiles,
        profile('squad-reroll', 'Accuracy', 'Abilities', {
          Description: 'Each time a model in this unit makes an attack, re-roll a Wound roll of 1.',
        }),
      ],
    },
    {
      ...unit('leader', 'Leader', { kind: 'Leader', text: 'This model can be attached to the following units:\n■ Squad' }),
      categoryLinks: categories('Character'),
      profiles: [
        ...unit('leader', 'Leader', { kind: 'Leader', text: 'This model can be attached to the following units:\n■ Squad' }).profiles,
        profile('leader-defence', 'Resilience', 'Abilities', {
          Description: 'Each time an attack is allocated to this model, subtract 1 from the Damage characteristic of that attack.',
        }),
      ],
    },
    unit('support', 'Support', { kind: 'Support', text: 'This model can be attached to the following units:\n■ Squad' }),
    unit('alternate', 'Alternate Leader', { kind: 'Leader', text: 'This model can be attached to the following units:\n■ Squad' }),
    unit('other', 'Other'),
  ],
})
const request = { catalogueId: 'cat', detachmentIds: [], picks: [{ entryId: 'squad' }], pickIndex: 0 }

it('offers legal leader and support choices without adding unrelated units', () => {
  expect(rosterCombatant(loaded, null, request)?.attachmentOptions).toEqual([
    { entryId: 'leader', catalogueId: 'cat', factionSlug: 'test-catalogue', name: 'Leader', kind: 'leader' },
    { entryId: 'alternate', catalogueId: 'cat', factionSlug: 'test-catalogue', name: 'Alternate Leader', kind: 'leader' },
    { entryId: 'support', catalogueId: 'cat', factionSlug: 'test-catalogue', name: 'Support', kind: 'support' },
  ])
})

it('offers replacements for an occupied member while keeping the other attachment slots occupied', () => {
  const result = rosterCombatant(loaded, null, {
    ...request,
    picks: [...request.picks, { entryId: 'leader', attachedTo: 0 }, { entryId: 'support', attachedTo: 0 }],
  })!
  expect(result.attachmentReplacements[1]).toEqual([
    { entryId: 'leader', catalogueId: 'cat', factionSlug: 'test-catalogue', name: 'Leader', kind: 'leader' },
    { entryId: 'alternate', catalogueId: 'cat', factionSlug: 'test-catalogue', name: 'Alternate Leader', kind: 'leader' },
  ])
})

it('offers the squad a standalone leader can join', () => {
  expect(rosterCombatant(loaded, null, { ...request, picks: [{ entryId: 'leader' }] })?.attachmentOptions).toEqual([
    { entryId: 'squad', catalogueId: 'cat', factionSlug: 'test-catalogue', name: 'Squad', kind: 'bodyguard' },
  ])
})

it('does not offer a squad to support that requires an existing leader', () => {
  const book = bookOf({
    selectionEntries: [
      unit('squad', 'Squad'),
      unit('support', 'Support', {
        kind: 'Support',
        text: 'This model can be attached to the following units (which already have a Leader):\n■ Squad',
      }),
    ],
  })
  expect(rosterCombatant(book, null, { ...request, picks: [{ entryId: 'support' }] })?.attachmentOptions).toEqual([])
})

it('does not add attacks for an unattached nearby unit', () => {
  expect(rosterCombatant(loaded, null, { ...request, picks: [...request.picks, { entryId: 'leader' }] })?.companions).toEqual([])
})

it('includes both attached members with distinct weapon identities', () => {
  const result = rosterCombatant(loaded, null, {
    ...request,
    picks: [...request.picks, { entryId: 'leader', attachedTo: 0 }, { entryId: 'support', attachedTo: 0 }],
  })!
  expect(result.companions.map((member) => [member.selected.name, member.carriers[0]!.weapons[0]!.profileIds])).toEqual([
    ['Leader', ['attached:1:leader-weapon']],
    ['Support', ['attached:2:support-weapon']],
  ])
})

it('shares squad abilities with the leader while retaining the leader’s personal protection', () => {
  const result = rosterCombatant(loaded, null, { ...request, picks: [...request.picks, { entryId: 'leader', attachedTo: 0 }] })!
  expect([result.rules.map((rule) => rule.name), result.companions[0]!.rules.map((rule) => rule.name)]).toEqual([
    ['Accuracy'],
    ['Resilience', 'Accuracy'],
  ])
})

it('keeps transferred unit abilities calculated for attached members', () => {
  const result = rosterCombatant(loaded, null, { ...request, picks: [...request.picks, { entryId: 'leader', attachedTo: 0 }] })!
  expect(
    result.companions[0]!.rules.find((rule) => rule.name === 'Accuracy') &&
      combatRuleChoices(result.companions[0]!.rules.find((rule) => rule.name === 'Accuracy')!)[0]?.effects,
  ).toEqual([{ role: 'attacker', phases: ['ranged', 'melee'], options: { woundReroll: 'ones' } }])
})

it('removes occupied leader slots while still offering support', () => {
  expect(
    rosterCombatant(loaded, null, { ...request, picks: [...request.picks, { entryId: 'leader', attachedTo: 0 }] })?.attachmentOptions,
  ).toEqual([{ entryId: 'support', catalogueId: 'cat', factionSlug: 'test-catalogue', name: 'Support', kind: 'support' }])
})

it('excludes inactive attached models and their rules', () => {
  expect(
    rosterCombatant(loaded, null, { ...request, picks: [...request.picks, { entryId: 'leader', attachedTo: 0 }], inactivePicks: [1] })
      ?.companions,
  ).toEqual([])
})

it('reports illegal attachments restored from a link', () => {
  expect(
    rosterCombatant(loaded, null, { ...request, picks: [...request.picks, { entryId: 'other', attachedTo: 0 }] })?.attachmentErrors,
  ).toEqual([{ entryId: 'other', entryName: 'Other', message: 'cannot be attached to another unit' }])
})

it('reports an attached member that cannot be projected instead of omitting it silently', () => {
  expect(
    rosterCombatant(loaded, null, { ...request, picks: [...request.picks, { entryId: 'missing', attachedTo: 0 }] })?.attachmentErrors,
  ).toContainEqual({ entryId: 'missing', entryName: 'missing', message: 'attached unit could not be loaded' })
})

const characterRules = {
  abilityDescriptions: new Map(),
  factionKeys: new Map(),
  byDetachment: new Map(),
  detachmentDetails: new Map(),
  core: [{ key: 'precision', name: 'Accuracy', cp: 1, limit: 'phase' }],
  coreDetails: [
    {
      id: 'precision',
      type: null,
      description:
        '**Target:** One **CHARACTER** unit from your army.\n\n**Effect:** Each time a model in your unit makes an attack, re-roll a Hit roll of 1.',
    },
  ],
} as Partial<LoadedRules> as LoadedRules

it('uses the attached unit’s Character keyword for stratagem eligibility without changing model keywords', () => {
  const result = rosterCombatant(loaded, characterRules, { ...request, picks: [...request.picks, { entryId: 'leader', attachedTo: 0 }] })!
  expect(result.rules.some((rule) => rule.id === 'stratagem:precision')).toBe(true)
  expect(result.selected.keywords).not.toContain('Character')
})

it('does not gain Character stratagem eligibility from an unattached model', () => {
  expect(
    rosterCombatant(loaded, characterRules, { ...request, picks: [...request.picks, { entryId: 'leader' }] })?.rules.some(
      (rule) => rule.id === 'stratagem:precision',
    ),
  ).toBe(false)
})
