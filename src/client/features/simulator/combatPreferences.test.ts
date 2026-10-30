import { expect, it } from 'vitest'
import { restoreWeaponPreferences, storeWeaponPreferences, invalidWeaponChoices, type PreferenceMember } from './combatPreferences'
import { preferenceBook } from '../../../server/combatPreferences.fixtures'
import { rosterCombatant } from '../../../shared/rosterCombatRules'
import { combatAttacks } from '../../../core/combatScenario'
import type { RosterPick } from '../../../core/roster'

const members: PreferenceMember[] = [
  { identity: 'book:0:squad', pickIndex: 0, profileIds: ['rifle-focused', 'rifle-spread'] },
  { identity: 'book:1:leader', pickIndex: 1, profileIds: ['attached:1:blade'] },
  { identity: 'book:2:support', pickIndex: 2, profileIds: ['attached:2:plasma-focused', 'attached:2:plasma-spread'] },
]

function moved(member: PreferenceMember, pickIndex: number, companion = true): PreferenceMember {
  return {
    ...member,
    pickIndex,
    profileIds: member.profileIds.map((id) => {
      const local = id.replace(/^attached:\d+:/, '')
      return companion ? `attached:${pickIndex}:${local}` : local
    }),
  }
}

const preferences = {
  'ranged:0:rifle': 'rifle-spread',
  'attached:2:ranged:0:plasma': 'attached:2:plasma-spread',
  'attached:2:ranged:ability:attached:2:plasma-spread:sustained': 'Sustained Hits 2',
  'attached:2:ranged:0:attached:2:plasma-spread:one-shot': 'spent',
}

it('round trips the original primary and companion weapon choices', () => {
  expect(restoreWeaponPreferences(storeWeaponPreferences({}, members, preferences), members)).toEqual(preferences)
})

it('preserves an unchanged support choice after a preceding leader is removed', () => {
  const remaining = [members[0]!, moved(members[2]!, 1)]
  expect(restoreWeaponPreferences(storeWeaponPreferences({}, members, preferences), remaining)).toEqual({
    'ranged:0:rifle': 'rifle-spread',
    'attached:1:ranged:0:plasma': 'attached:1:plasma-spread',
    'attached:1:ranged:ability:attached:1:plasma-spread:sustained': 'Sustained Hits 2',
    'attached:1:ranged:0:attached:1:plasma-spread:one-shot': 'spent',
  })
})

it('retains a promoted character’s profile and one-shot choice after removing the squad', () => {
  const promoted = [moved(members[2]!, 0, false)]
  expect(restoreWeaponPreferences(storeWeaponPreferences({}, members, preferences), promoted)).toEqual({
    'ranged:0:plasma': 'plasma-spread',
    'ranged:ability:plasma-spread:sustained': 'Sustained Hits 2',
    'ranged:0:plasma-spread:one-shot': 'spent',
  })
})

it('preserves companions’ choices when the squad is replaced', () => {
  const replacement = [{ ...members[0]!, identity: 'book:3:replacement' }, ...members.slice(1)]
  expect(restoreWeaponPreferences(storeWeaponPreferences({}, members, preferences), replacement)).toEqual(
    Object.fromEntries(Object.entries(preferences).filter(([key]) => key.startsWith('attached:'))),
  )
})

it('keeps profile namespaces based on absolute roster positions and choice namespaces based on companion order', () => {
  const projected = [{ ...members[0]!, pickIndex: 3 }, moved(members[2]!, 7)]
  expect(restoreWeaponPreferences(storeWeaponPreferences({}, members, preferences), projected)['attached:1:ranged:0:plasma']).toBe(
    'attached:7:plasma-spread',
  )
})

it('does not apply a replaced member’s choices to another rules version of that datasheet', () => {
  const replacement = [members[0]!, members[1]!, { ...members[2]!, identity: 'book-preview:4:support' }]
  expect(restoreWeaponPreferences(storeWeaponPreferences({}, members, preferences), replacement)).toEqual({
    'ranged:0:rifle': 'rifle-spread',
  })
})

it('keeps a different saved unit’s preferences when the current unit’s choices change', () => {
  const first = storeWeaponPreferences({}, members, preferences)
  const other = [{ identity: 'book:9:another-squad', pickIndex: 9, profileIds: ['rifle-focused'] }]
  const next = storeWeaponPreferences(first, other, { 'ranged:0:rifle': 'rifle-focused' })
  expect(restoreWeaponPreferences(next, members)).toEqual(preferences)
})

it('uses the retained nondefault profile in the authoritative attack after removing a preceding member', () => {
  const book = preferenceBook()
  const project = (picks: RosterPick[], keys: number[]) => {
    const result = rosterCombatant(book, null, { catalogueId: 'cat', detachmentIds: [], picks, pickIndex: 0 })!
    const projected = [{ ...result, pickIndex: 0 }, ...result.companions]
    return {
      members: projected.map((member) => ({
        identity: `cat:${keys[member.pickIndex]}:${picks[member.pickIndex]!.entryId}`,
        pickIndex: member.pickIndex,
        profileIds: member.selected.profiles.map((profile) => profile.id),
      })),
      attacker: {
        sheet: result.selected,
        carriers: result.carriers,
        models: 1,
        companions: result.companions.map((member) => ({ sheet: member.selected, carriers: member.carriers, models: member.models })),
      },
    }
  }
  const previous = project([{ entryId: 'squad' }, { entryId: 'leader', attachedTo: 0 }, { entryId: 'support', attachedTo: 0 }], [0, 1, 2])
  const opponent = { keywords: [], rules: [] }
  const excluded = { ranged: [], melee: [] }
  const choices = combatAttacks(previous.attacker, opponent, {}, excluded).ranged.plan.choices
  const selected = choices.find((choice) => choice.options.some((option) => option.value === 'attached:2:support-spread'))!
  const stored = storeWeaponPreferences({}, previous.members, { [selected.key]: 'attached:2:support-spread' })
  const next = project([{ entryId: 'squad' }, { entryId: 'support', attachedTo: 0 }], [0, 2])
  const attack = combatAttacks(next.attacker, opponent, restoreWeaponPreferences(stored, next.members), excluded)
  expect({
    errors: attack.ranged.plan.errors,
    weapons: attack.ranged.plan.used.map((entry) => [entry.profile.id, entry.weapon?.damage.bonus]),
  }).toEqual({ errors: [], weapons: [['attached:1:support-spread', 3]] })
})

it('discards only choices tied to profiles removed by an equipment edit', () => {
  const stored = storeWeaponPreferences({}, members, preferences)
  const changed = [...members.slice(0, 2), { ...members[2]!, profileIds: ['attached:2:plasma-focused'] }]
  expect(restoreWeaponPreferences(stored, changed)).toEqual({ 'ranged:0:rifle': 'rifle-spread' })
})

it('retains surviving profile and literal choices when another profile is removed', () => {
  const chosen = {
    'attached:2:ranged:0:plasma': 'attached:2:plasma-focused',
    'attached:2:ranged:ability:attached:2:plasma-focused:sustained': 'Sustained Hits 2',
  }
  const stored = storeWeaponPreferences({}, members, chosen)
  const changed = [...members.slice(0, 2), { ...members[2]!, profileIds: ['attached:2:plasma-focused'] }]
  expect(restoreWeaponPreferences(stored, changed)).toEqual(chosen)
})

it('rejects an unavailable option from the actual weapon choice without clearing latent choices', () => {
  const result = rosterCombatant(preferenceBook(), null, {
    catalogueId: 'cat',
    detachmentIds: [],
    picks: [{ entryId: 'support' }],
    pickIndex: 0,
  })!
  const plan = combatAttacks(
    { sheet: result.selected, carriers: result.carriers, models: 1 },
    { keywords: [], rules: [] },
    {},
    { ranged: [], melee: [] },
  ).ranged.plan
  const choice = plan.choices.find((entry) => entry.options.some((option) => option.value === 'support-spread'))!
  expect(
    invalidWeaponChoices({ [choice.key]: 'removed-profile', 'ranged:ability:latent-profile:sustained': 'Sustained Hits 2' }, plan.choices),
  ).toEqual([choice.key])
})

it('accepts a valid nondefault option from the actual weapon choice', () => {
  const result = rosterCombatant(preferenceBook(), null, {
    catalogueId: 'cat',
    detachmentIds: [],
    picks: [{ entryId: 'support' }],
    pickIndex: 0,
  })!
  const plan = combatAttacks(
    { sheet: result.selected, carriers: result.carriers, models: 1 },
    { keywords: [], rules: [] },
    {},
    { ranged: [], melee: [] },
  ).ranged.plan
  const choice = plan.choices.find((entry) => entry.options.some((option) => option.value === 'support-spread'))!
  expect(invalidWeaponChoices({ [choice.key]: 'support-spread' }, plan.choices)).toEqual([])
})
