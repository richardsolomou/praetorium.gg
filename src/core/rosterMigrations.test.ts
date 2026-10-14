import { expect, it } from 'vitest'
import { currentDetachmentId, currentPick, currentRosterIds } from './retiredCatalogueIds'

it('keeps unchanged Dark Angels detachments when their generated wrappers are removed', () => {
  expect([
    currentDetachmentId('profile-detachment-option-470a-6daa-9014-12df-64a6-9332-de28-21a9'),
    currentDetachmentId('profile-detachment-option-470a-6daa-9014-12df-9d23-833a-17cb-2d7d'),
  ]).toEqual(['64a6-9332-de28-21a9', '9d23-833a-17cb-2d7d'])
})

it('keeps the Scout Sergeant chainsword when its weapon group splits into ranged and melee', () => {
  expect(
    currentPick({
      entryId: '3c0a-10a9-8f84-26a3',
      choices: { 'd0cd-b8dc-82e-5eb8/34be-35f8-9966-c99f/fe9c-f9ed-2182-bd33': '3372-7d35-b60e-24a9' },
    }).choices,
  ).toEqual({
    'd0cd-b8dc-82e-5eb8/34be-35f8-9966-c99f/aa70-d014-e89b-7e37': '3372-7d35-b60e-24a9',
  })
})

it('keeps each Ravenwing command model plasma talon in its own model slot', () => {
  expect(
    currentPick({
      entryId: 'e1ac-1406-1081-8ea3',
      choices: {
        'b342-4005-baec-3598/6545-a196-d075-bf4e': 'd208-29d5-5f5f-917d',
        'd445-3ac1-64d5-fd4a/3771-6c3c-4035-70fa': 'd865-b3ae-72eb-73e3',
        'f227-6107-836d-3fee/ef39-2ca8-0396-efc9/3b1a-9e16-a44b-b70a': 'ef7c-6497-d952-88a9',
      },
    }).choices,
  ).toEqual({
    'b342-4005-baec-3598/f4ca-73f2-e914-8c86': 'd865-b3ae-72eb-73e3',
    'd445-3ac1-64d5-fd4a/c396-2094-f726-0d5f': 'd865-b3ae-72eb-73e3',
    'f227-6107-836d-3fee/ef39-2ca8-0396-efc9/2cce-fb22-6473-56de': 'd865-b3ae-72eb-73e3',
  })
})

it('keeps the Invader ATV multi-melta choice under the added squad wrapper', () => {
  expect(
    currentPick({ entryId: '8b71-580f-ad19-83d7', choices: { '692c-f7be-75d4-ba2d/f1f6-718e-222f-9ed5': 'b440-75d0-9e95-486a' } }).choices,
  ).toEqual({
    '266c-3f4c-4aed-9472/8d7b-3dfe-7b91-2490/692c-f7be-75d4-ba2d/f1f6-718e-222f-9ed5': 'b440-75d0-9e95-486a',
  })
})

it('preserves split-loadout counts, model counts, and attachments through repeated migration', () => {
  const roster = {
    catalogueId: 'f89b-84e0-6e3b-f1e2',
    detachmentIds: [],
    picks: [
      {
        entryId: '8b71-580f-ad19-83d7',
        models: 2,
        attachedTo: 1,
        spreads: { '692c-f7be-75d4-ba2d/f1f6-718e-222f-9ed5': { 'b440-75d0-9e95-486a': 2 } },
      },
    ],
  }
  const migrated = currentRosterIds(roster)
  expect(currentRosterIds(migrated)).toEqual({
    ...roster,
    picks: [
      {
        ...roster.picks[0],
        spreads: {
          '266c-3f4c-4aed-9472/8d7b-3dfe-7b91-2490/692c-f7be-75d4-ba2d/f1f6-718e-222f-9ed5': { 'b440-75d0-9e95-486a': 2 },
        },
      },
    ],
  })
})

it('leaves an unverified option on a migrated unit visible for resolution', () => {
  expect(
    currentPick({ entryId: '3c0a-10a9-8f84-26a3', choices: { 'd0cd-b8dc-82e-5eb8/34be-35f8-9966-c99f/fe9c-f9ed-2182-bd33': 'unverified' } })
      .choices,
  ).toEqual({
    'd0cd-b8dc-82e-5eb8/34be-35f8-9966-c99f/fe9c-f9ed-2182-bd33': 'unverified',
  })
})

const legacyAtv = {
  entryId: '8b71-580f-ad19-83d7',
  choices: { '692c-f7be-75d4-ba2d/f1f6-718e-222f-9ed5': 'b440-75d0-9e95-486a' },
}

it('keeps loadouts and detachments belonging to a retained catalogue edition', () => {
  const roster = {
    catalogueId: 'previous~f89b-84e0-6e3b-f1e2',
    detachmentIds: ['profile-detachment-option-470a-6daa-9014-12df-64a6-9332-de28-21a9'],
    picks: [legacyAtv],
  }
  expect(currentRosterIds(roster)).toEqual(roster)
})

it('keeps an allied loadout belonging to an explicit catalogue edition', () => {
  const pick = { ...legacyAtv, catalogueId: 'previous~f89b-84e0-6e3b-f1e2' }
  expect(currentPick(pick, 'f89b-84e0-6e3b-f1e2')).toEqual(pick)
})

it('adds split model quantities when old and current paths converge', () => {
  expect(
    currentPick({
      ...legacyAtv,
      spreads: {
        '692c-f7be-75d4-ba2d/f1f6-718e-222f-9ed5': { 'b440-75d0-9e95-486a': 1 },
        '266c-3f4c-4aed-9472/8d7b-3dfe-7b91-2490/692c-f7be-75d4-ba2d/f1f6-718e-222f-9ed5': { 'b440-75d0-9e95-486a': 2 },
      },
    }).spreads,
  ).toEqual({
    '266c-3f4c-4aed-9472/8d7b-3dfe-7b91-2490/692c-f7be-75d4-ba2d/f1f6-718e-222f-9ed5': { 'b440-75d0-9e95-486a': 3 },
  })
})

it('retains conflicting old choices for resolution rather than overwriting a current selection', () => {
  const pick = {
    ...legacyAtv,
    choices: {
      ...legacyAtv.choices,
      '266c-3f4c-4aed-9472/8d7b-3dfe-7b91-2490/692c-f7be-75d4-ba2d/f1f6-718e-222f-9ed5': 'different-option',
    },
  }
  expect(currentPick(pick)).toEqual(pick)
})

it('keeps an unqualified allied loadout inside a retained roster edition', () => {
  const pick = { ...legacyAtv, catalogueId: 'f89b-84e0-6e3b-f1e2' }
  expect(currentPick(pick, 'previous~e0af-67df-9d63-8fb7')).toEqual(pick)
})

it('preserves all three optional Land Raider Redeemer weapons and their counts', () => {
  expect(
    currentPick({
      entryId: '2b9d-9c13-9277-d157',
      spreads: { '785c-4575-4fc1-fe2a': { 'fda7-4dfc-d586-8c51': 1, 'aa40-6725-eb70-f48f': 1, '478f-f6a0-3bd4-0853': 1 } },
    }).spreads,
  ).toEqual({ '376d-e493-b439-19f4': { 'b418-c052-b121-7655': 1, 'd11b-4ab-38fc-44b': 1, 'd8fc-6404-720b-31ee': 1 } })
})

it('moves the Scout Sergeant chainsword statement into the same model melee slot', () => {
  expect(currentPick({ entryId: '3c0a-10a9-8f84-26a3', choices: { 'e5e9-8c26-629c-8962': 'f869-744f-bf72-013d' } }).choices).toEqual({
    'd0cd-b8dc-82e-5eb8/34be-35f8-9966-c99f/aa70-d014-e89b-7e37': '3372-7d35-b60e-24a9',
  })
})

it('keeps the Deathwing heavy-weapon model power fist in its original slot', () => {
  const key = 'e082-9cb8-ce5e-826d/5e6d-5b97-f4b5-7cd9/fba4-75c7-84da-bcb4'
  expect(currentPick({ entryId: 'd9b9-5a27-3836-1125', choices: { [key]: 'bef-1df5-dd8b-93fe' } }).choices).toEqual({
    [key]: '4005-701e-21a1-f2df',
  })
})

it('retains removed Dark Angels detachments and loadouts on their original rules', () => {
  const roster = {
    catalogueId: '470a-6daa-9014-12df',
    detachmentIds: ['41e6-d47c-5e68-e066'],
    picks: [
      { entryId: 'e1ac-1406-1081-8ea3', choices: { 'f227-6107-836d-3fee/131c-8a56-d003-b9a9/ec87-a124-bfd1-f293': '14d-7f50-6c23-9f23' } },
    ],
  }
  expect(currentRosterIds(currentRosterIds(roster))).toEqual({ ...roster, catalogueId: 'legacy-rosters~470a-6daa-9014-12df' })
})

it('retains a removed loadout even when every selected detachment still exists', () => {
  const picks = [
    { entryId: '85b1-eb9a-17a6-e5be', choices: { 'e371-90b3-5640-949/8ea3-b125-7273-5ffb/bcb6-f6d1-cfc6-f4f3': '3e88-327f-be98-d923' } },
  ]
  expect(currentRosterIds({ catalogueId: '470a-6daa-9014-12df', detachmentIds: ['9d23-833a-17cb-2d7d'], picks }).catalogueId).toBe(
    'legacy-rosters~470a-6daa-9014-12df',
  )
})

it('does not retain a roster merely because it saved zero of a removed model option', () => {
  expect(
    currentRosterIds({
      catalogueId: '470a-6daa-9014-12df',
      detachmentIds: [],
      picks: [{ entryId: '3c0a-10a9-8f84-26a3', spreads: { 'd0cd-b8dc-82e-5eb8': { '5173-cc7b-b53a-514': 0 } } }],
    }).catalogueId,
  ).toBe('470a-6daa-9014-12df')
})

it('keeps borrowed removed detachments on the retained rules', () => {
  expect(
    currentRosterIds({ catalogueId: '470a-6daa-9014-12df', detachmentIds: [], borrowedDetachmentId: '41e6-d47c-5e68-e066' }).catalogueId,
  ).toBe('legacy-rosters~470a-6daa-9014-12df')
})

it('keeps mixed original Marine gear and profile upgrades on the earlier complete rules', () => {
  const roster = {
    catalogueId: '470a-6daa-9014-12df',
    detachmentIds: [],
    picks: [
      { entryId: 'a74c-27a6-a054-e13c', choices: { 'profile-enhancements-8a9d-11f-fad-bd0f/313d-fbf4-76fa-1c0e': 'a353-795d-f8a1-e18d' } },
      { entryId: '3c0a-10a9-8f84-26a3', spreads: { 'd0cd-b8dc-82e-5eb8': { '5173-cc7b-b53a-514': 2 } } },
    ],
  }
  expect(currentRosterIds(currentRosterIds(roster))).toEqual({ ...roster, catalogueId: 'legacy-marine-old~470a-6daa-9014-12df' })
})

it('uses later retained Marine rules when no earlier removed gear was saved', () => {
  expect(
    currentRosterIds({
      catalogueId: '470a-6daa-9014-12df',
      detachmentIds: [],
      picks: [
        {
          entryId: 'a74c-27a6-a054-e13c',
          choices: { 'profile-enhancements-8a9d-11f-fad-bd0f/313d-fbf4-76fa-1c0e': 'a353-795d-f8a1-e18d' },
        },
      ],
    }).catalogueId,
  ).toBe('legacy-profiles~470a-6daa-9014-12df')
})

it('does not read a list on MFM 1.4 rules when it was saved after the app served MFM 1.5', () => {
  const roster = {
    catalogueId: '470a-6daa-9014-12df',
    detachmentIds: [],
    picks: [{ entryId: '3c0a-10a9-8f84-26a3', spreads: { 'd0cd-b8dc-82e-5eb8': { '5173-cc7b-b53a-514': 2 } } }],
    updatedAt: Date.UTC(2026, 9, 3),
  }
  expect(currentRosterIds(roster).catalogueId).toBe('470a-6daa-9014-12df')
})

it('reads a list with a removed detachment saved between MFM 1.5 and the codex on pre-codex MFM 1.5 rules', () => {
  expect(
    currentRosterIds({
      catalogueId: '470a-6daa-9014-12df',
      detachmentIds: ['profile-detachment-option-470a-6daa-9014-12df-41e6-d47c-5e68-e066'],
      updatedAt: Date.UTC(2026, 9, 3),
    }).catalogueId,
  ).toBe('legacy-profiles~470a-6daa-9014-12df')
})
