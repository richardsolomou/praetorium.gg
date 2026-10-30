import { expect, it } from 'vitest'
import { rosterCombatant } from '../../../shared/rosterCombatRules'
import { preferenceBook } from '../../../server/combatPreferences.fixtures'
import { resolveCombatRequest } from '../../../core/combatMatchup'
import { rosterCombatIndices, rosterCombatSnapshot, rosterCombatRequest, summarizeRosterCombat } from './rosterCombat'

it('counts an attached unit once and keeps repeated squads separate', () => {
  expect(
    rosterCombatIndices([
      { entryId: 'squad' },
      { entryId: 'leader', attachedTo: 0 },
      { entryId: 'squad' },
      { entryId: 'support', attachedTo: 0 },
    ]),
  ).toEqual([0, 2])
})

it('counts a character joined to an attached character with the whole unit', () => {
  expect(
    rosterCombatIndices([{ entryId: 'squad' }, { entryId: 'command', attachedTo: 0 }, { entryId: 'protector', attachedTo: 1 }]),
  ).toEqual([0])
})

it('refuses attachments in a loop rather than omitting units', () => {
  expect(() =>
    rosterCombatIndices([
      { entryId: 'a', attachedTo: 1 },
      { entryId: 'b', attachedTo: 0 },
    ]),
  ).toThrow('attachment')
})

it('refuses malformed attachments rather than omitting units', () => {
  expect(() => rosterCombatIndices([{ entryId: 'leader', attachedTo: 2 }])).toThrow('attachment')
})

it('retains the selected plasma equipment rather than the default staff', () => {
  const picks = [{ entryId: 'squad' }, { entryId: 'support', attachedTo: 0, choices: { 'support-weapon': 'plasma' } }]
  const data = rosterCombatant(preferenceBook(true), null, { catalogueId: 'cat', detachmentIds: [], picks, pickIndex: 0 })!
  expect(
    rosterCombatSnapshot(data, picks)
      .companions![0]!.sheet.profiles.filter((profile) => profile.type === 'Ranged Weapons')
      .map((profile) => profile.name),
  ).toEqual(['Plasma - focused', 'Plasma - spread'])
})

it('retains unsupported phase errors beside an available phase', () => {
  const data = rosterCombatant(preferenceBook(false, 'Leader'), null, {
    catalogueId: 'cat',
    detachmentIds: [],
    picks: [{ entryId: 'support' }],
    pickIndex: 0,
  })!
  const snapshot = rosterCombatSnapshot(data, [{ entryId: 'support' }])
  const broken = {
    ...snapshot,
    sheet: {
      ...snapshot.sheet,
      profiles: snapshot.sheet.profiles.map((profile) =>
        profile.type === 'Ranged Weapons'
          ? { ...profile, values: profile.values.map((value) => (value.name === 'A' ? { ...value, value: 'unknown' } : value)) }
          : profile,
      ),
    },
  }
  const { request, unavailable } = rosterCombatRequest(broken, snapshot)
  const answer = summarizeRosterCombat(resolveCombatRequest(request), unavailable)
  expect([answer.ranged?.error, answer.melee?.result?.wipe, answer.combined?.error]).toEqual([expect.any(String), 0, expect.any(String)])
})

it('stores only the summary for each completed pairing', () => {
  const data = rosterCombatant(preferenceBook(), null, {
    catalogueId: 'cat',
    detachmentIds: [],
    picks: [{ entryId: 'squad' }],
    pickIndex: 0,
  })!
  const snapshot = rosterCombatSnapshot(data, [{ entryId: 'squad' }])
  const { request, unavailable } = rosterCombatRequest(snapshot, snapshot)
  expect(summarizeRosterCombat(resolveCombatRequest(request), unavailable).combined).toEqual({
    result: { wipe: 0, meanDamage: 0, meanKills: 0, uncappedKills: 0 },
  })
})
