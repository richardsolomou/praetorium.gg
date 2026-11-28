import { expect, it } from 'vitest'
import { bsdataRecords, gdcRuleRecords, vsDataRecordOfBsdata } from './vsData'

const entries = {
  'ability:adeptus-mechanicus.onager-dunecrawler.scuttling-walker': ['bsdata.6b1e.4f2.9c0d.a11'],
  'ability:chaos-daemons.soul-grinder.scuttling-walker': [],
  'core-ability:deadly-demise': ['bsdata.33c0.1d2e.aa1.7f'],
}

it('reads a BSData id through the VS Data alias that writes it with dots', () => {
  expect(vsDataRecordOfBsdata(bsdataRecords(entries, {}, null), '6b1e-4f2-9c0d-a11')).toBe(
    'ability:adeptus-mechanicus.onager-dunecrawler.scuttling-walker',
  )
})

it('reads a profile several datasheets share as the record its own datasheet has', () => {
  const records = bsdataRecords(entries, { 'grinder/6b1e-4f2-9c0d-a11': 'ability:chaos-daemons.soul-grinder.scuttling-walker' }, null)
  expect(vsDataRecordOfBsdata(records, '6b1e-4f2-9c0d-a11', 'grinder')).toBe('ability:chaos-daemons.soul-grinder.scuttling-walker')
})

it('reads no record for a datasheet frozen as having none, not the id’s alias', () => {
  const records = bsdataRecords(entries, { 'grinder/6b1e-4f2-9c0d-a11': null }, null)
  expect(vsDataRecordOfBsdata(records, '6b1e-4f2-9c0d-a11', 'grinder')).toBeUndefined()
})

it('reads a rules version’s own frozen entry over the one every version shares', () => {
  const frozen = {
    'grinder/6b1e-4f2-9c0d-a11': 'ability:chaos-daemons.soul-grinder.scuttling-walker',
    'legacy-rosters~grinder/6b1e-4f2-9c0d-a11': 'ability:adeptus-mechanicus.onager-dunecrawler.scuttling-walker',
  }
  expect(vsDataRecordOfBsdata(bsdataRecords(entries, frozen, 'legacy-rosters'), '6b1e-4f2-9c0d-a11', 'grinder')).toBe(
    'ability:adeptus-mechanicus.onager-dunecrawler.scuttling-walker',
  )
})

it('reads a card’s primarch abilities by the alias its other abilities take', () => {
  const ability = { name: { en: 'Phaeron of the Stars (Aura)' }, description: { en: 'Re-roll a Hit roll of 1.' } }
  const card = {
    id: 'necrons',
    datasheets: [{ id: 'a1-b2', abilities: { primarch: [{ name: { en: 'Triarch Abilities' }, abilities: [ability] }] } }],
  }
  expect(gdcRuleRecords(card).flatMap((record) => record.keys)).toContain('gdc.unit.ability.a1.b2.phaeron.of.the.stars.aura')
})
