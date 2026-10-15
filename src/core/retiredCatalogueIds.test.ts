import { describe, expect, it } from 'vitest'
import { migrateStoredRoster } from './savedRosterMigrations'
import {
  currentCatalogueId,
  currentCatalogueFamilyId,
  currentDetachmentId,
  currentEntryId,
  currentRosterIds,
  picksForRulesVersion,
  savedCatalogueIds,
  savedDetachmentIds,
} from './retiredCatalogueIds'

const ultramarines = { retired: 'a603-5039-f08d-e841', current: '4029-9237-e8db-af55' }
const spaceMarines = { retired: 'e0af-67df-9d63-8fb8', current: 'e0af-67df-9d63-8fb7' }
const gladius = { retired: 'profile-detachment-option-a603-5039-f08d-e841-f367-3240-47c1-7e1a', current: 'd2dc-693e-b491-b16d' }
const stormlance = { retired: 'profile-detachment-option-a603-5039-f08d-e841-fb20-be3c-55aa-0512', current: '50ed-e07c-8f6b-b035' }
const calgar = { retired: 'profile-unit-a603-5039-f08d-e841-5302-e1f9-0338-76f9', current: '984d-c25b-86dd-9970' }
const intercessors = { retired: 'profile-unit-e0af-67df-9d63-8fb8-34c7-75dd-fcff-ec94', current: '85b1-eb9a-17a6-e5be' }
const captain = { retired: 'profile-unit-e0af-67df-9d63-8fb8-024a-3fea-7765-4e82', current: '91e3-a419-8c58-98f5' }
const captainWeapon = { retired: 'e038-1d97-3bd5-d639', current: 'ccdb-b984-df14-9b54/c6aa-b3a5-4ff3-e0d3/1591-a4ae-50fb-3c21' }
const powerFist = { retired: '1e33-9a19-2d1c-418f', current: '667f-2fe-d8c8-c6f7' }
const masterCrafted = { retired: '7f6a-be5f-6a19-acf4', current: 'e77-5303-12ad-cbde' }
const warlord = { retired: 'profile-warlord-e0af-67df-9d63-8fb8-024a-3fea-7765-4e82', current: 'a89c-b01e-ffab-8ebb' }
const unmatchedOption = 'retired-group'

describe('retired catalogue ids', () => {
  it('groups an archived faction with its verified replacement for rules conversion', () => {
    expect(currentCatalogueFamilyId(`legacy-profiles~${ultramarines.retired}`)).toBe(ultramarines.current)
  })

  it('converts generated Marine entries and allied books to their verified current identities', () => {
    expect(
      picksForRulesVersion(
        [
          { entryId: calgar.retired },
          { entryId: intercessors.retired, catalogueId: `legacy-profiles~${spaceMarines.retired}`, models: 10, attachedTo: 0 },
        ],
        ultramarines.current,
      ),
    ).toEqual([
      { entryId: calgar.current },
      { entryId: intercessors.current, catalogueId: spaceMarines.current, models: 10, attachedTo: 0 },
    ])
  })

  it('preserves original identities when selecting a retained version', () => {
    expect(picksForRulesVersion([{ entryId: calgar.retired }], `legacy-profiles~${ultramarines.retired}`)).toEqual([
      { entryId: calgar.retired },
    ])
  })
  it('maps a retired Marine codex book to its current book', () => {
    expect(currentCatalogueId(ultramarines.retired)).toBe(ultramarines.current)
  })

  it('maps a retired detachment to the current detachment of the same name', () => {
    expect(currentDetachmentId(gladius.retired)).toBe(gladius.current)
  })

  it('maps a retired datasheet to the current datasheet of the same name', () => {
    expect(currentEntryId(calgar.retired)).toBe(calgar.current)
  })

  it('keeps an id that has no verified current equivalent', () => {
    expect(currentEntryId('retired-entry')).toBe('retired-entry')
  })

  it('keeps a current id', () => {
    expect(currentCatalogueId(ultramarines.current)).toBe(ultramarines.current)
  })

  it('retains a saved profile roster on its original Marine rules', () => {
    expect(
      currentRosterIds({
        catalogueId: ultramarines.retired,
        detachmentIds: [gladius.retired],
        borrowedDetachmentId: stormlance.retired,
        picks: [
          { entryId: calgar.retired },
          { entryId: intercessors.retired, catalogueId: spaceMarines.retired, models: 10, attachedTo: 0 },
        ],
      }),
    ).toEqual({
      catalogueId: `legacy-profiles~${ultramarines.retired}`,
      detachmentIds: [gladius.retired],
      borrowedDetachmentId: stormlance.retired,
      picks: [
        { entryId: calgar.retired },
        { entryId: intercessors.retired, catalogueId: `legacy-profiles~${spaceMarines.retired}`, models: 10, attachedTo: 0 },
      ],
    })
  })

  it('moves the choices, spreads and Warlord toggle that match one to one', () => {
    const [pick] = currentRosterIds({
      catalogueId: spaceMarines.retired,
      detachmentIds: [],
      picks: [
        {
          entryId: captain.retired,
          choices: { [captainWeapon.retired]: powerFist.retired },
          spreads: { [captainWeapon.retired]: { [masterCrafted.retired]: 1 } },
          toggles: { [warlord.retired]: 1 },
        },
      ],
    }).picks
    expect(pick).toEqual({
      entryId: captain.current,
      choices: { [captainWeapon.current]: powerFist.current },
      spreads: { [captainWeapon.current]: { [masterCrafted.current]: 1 } },
      toggles: { [warlord.current]: 1 },
    })
  })

  it('keeps a choice without a one-to-one match for pricing to report', () => {
    const [pick] = currentRosterIds({
      catalogueId: spaceMarines.retired,
      detachmentIds: [],
      picks: [{ entryId: captain.retired, choices: { [unmatchedOption]: 'retired-option' }, toggles: { 'retired-toggle': 1 } }],
    }).picks
    expect(pick).toEqual({
      entryId: captain.current,
      choices: { [unmatchedOption]: 'retired-option' },
      toggles: { 'retired-toggle': 1 },
    })
  })

  it('leaves a roster without retired ids unchanged', () => {
    const roster = { catalogueId: 'necrons', detachmentIds: ['awakened'], borrowedDetachmentId: null, picks: [{ entryId: 'warriors' }] }
    expect(currentRosterIds(roster)).toEqual(roster)
  })

  it('moves a roster on a folded MFM 1.5 version to the current rules, keeping a removed choice to reselect', () => {
    const roster = {
      catalogueId: 'current-rosters~470a-6daa-9014-12df',
      detachmentIds: ['9d23-833a-17cb-2d7d'],
      picks: [{ entryId: '3c0a-10a9-8f84-26a3', models: 5, spreads: { 'd0cd-b8dc-82e-5eb8': { '5173-cc7b-b53a-514': 2 } } }],
    }
    expect(currentRosterIds(roster)).toEqual({ ...roster, catalogueId: '470a-6daa-9014-12df' })
  })

  it('never routes a roster from a folded version back to older rules', () => {
    const roster = {
      catalogueId: 'marine-main~470a-6daa-9014-12df',
      detachmentIds: [],
      picks: [{ entryId: '3c0a-10a9-8f84-26a3', spreads: { 'd0cd-b8dc-82e-5eb8': { '5173-cc7b-b53a-514': 2 } } }],
    }
    expect(currentRosterIds(roster).catalogueId).toBe('470a-6daa-9014-12df')
  })

  it('moves a Marine roster on MFM 1.5 to the current rules', () => {
    expect(currentRosterIds({ catalogueId: 'marine-points-1013~470a-6daa-9014-12df', detachmentIds: [] }).catalogueId).toBe(
      '470a-6daa-9014-12df',
    )
  })

  it.each([undefined, 0])('moves a Custodes preview roster last saved at %s to the current codex', (updatedAt) => {
    expect(currentRosterIds({ catalogueId: 'custodes-11e~1f19-6509-d906-ca10', detachmentIds: [], updatedAt }).catalogueId).toBe(
      'mfm-1-6~1f19-6509-d906-ca10',
    )
  })

  it('keeps a Custodes preview roster on the current codex after its stored row is migrated', () => {
    const row = migrateStoredRoster({ name: '', catalogueId: 'custodes-11e~1f19-6509-d906-ca10', picks: '[]' })
    expect(currentRosterIds({ catalogueId: row.catalogueId, detachmentIds: [], updatedAt: 0 }).catalogueId).toBe(
      'mfm-1-6~1f19-6509-d906-ca10',
    )
  })

  it('keeps an index Custodes roster on MFM 1.5 where it was saved', () => {
    expect(currentRosterIds({ catalogueId: 'marine-points-1013~1f19-6509-d906-ca10', detachmentIds: [] }).catalogueId).toBe(
      'marine-points-1013~1f19-6509-d906-ca10',
    )
  })

  it.each([
    [1792067001999, 'marine-points-1013~1f19-6509-d906-ca10'],
    [1792067002000, '1f19-6509-d906-ca10'],
  ])('reads a Custodes roster last saved at %i on %s', (updatedAt, catalogueId) => {
    expect(currentRosterIds({ catalogueId: '1f19-6509-d906-ca10', detachmentIds: [], updatedAt }).catalogueId).toBe(catalogueId)
  })

  it('finds a Custodes preview roster that reads as the current codex', () => {
    expect(savedCatalogueIds(['mfm-1-6~1f19-6509-d906-ca10'])).toContain('custodes-11e~1f19-6509-d906-ca10')
  })

  it('finds no folded MFM 1.5 Custodes roster for the current codex', () => {
    expect(savedCatalogueIds(['1f19-6509-d906-ca10'])).not.toContain('marine-points-1013~1f19-6509-d906-ca10')
  })

  it('finds a saved book that reads as the current book it was replaced by', () => {
    expect(savedCatalogueIds([ultramarines.current])).toContain(ultramarines.retired)
  })

  it('finds a roster still stored on a rules version that folded into the current one', () => {
    expect(savedCatalogueIds(['470a-6daa-9014-12df'])).toContain('marine-main~470a-6daa-9014-12df')
  })

  it('finds no other book for an ID nothing replaced', () => {
    expect(savedCatalogueIds(['necrons'])).toEqual(['necrons'])
  })

  it('finds a saved detachment that reads as the current detachment it was replaced by', () => {
    expect(savedDetachmentIds([gladius.current])).toContain(gladius.retired)
  })

  it('finds no other detachment for an ID nothing replaced', () => {
    expect(savedDetachmentIds(['awakened'])).toEqual(['awakened'])
  })
})
