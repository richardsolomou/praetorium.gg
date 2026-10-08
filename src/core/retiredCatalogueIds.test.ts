import { describe, expect, it } from 'vitest'
import { currentCatalogueId, currentDetachmentId, currentEntryId, currentRosterIds } from './retiredCatalogueIds'

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

  it('moves a saved roster to current ids', () => {
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
      catalogueId: ultramarines.current,
      detachmentIds: [gladius.current],
      borrowedDetachmentId: stormlance.current,
      picks: [{ entryId: calgar.current }, { entryId: intercessors.current, catalogueId: spaceMarines.current, models: 10, attachedTo: 0 }],
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
})
