import { expect, it } from 'vitest'
import { bsdataRecords, vsDataRecordOfBsdata } from './vsData'

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

it('reads a rules version’s own frozen entry only in that version', () => {
  const frozen = {
    'grinder/6b1e-4f2-9c0d-a11': 'ability:chaos-daemons.soul-grinder.scuttling-walker',
    'legacy-rosters~grinder/6b1e-4f2-9c0d-a11': 'ability:adeptus-mechanicus.onager-dunecrawler.scuttling-walker',
  }
  expect(vsDataRecordOfBsdata(bsdataRecords(entries, frozen, null), '6b1e-4f2-9c0d-a11', 'grinder')).toBe(
    'ability:chaos-daemons.soul-grinder.scuttling-walker',
  )
})
