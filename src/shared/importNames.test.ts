import { expect, it } from 'vitest'
import { importNamesOf } from './importNames'

it('gives a stored Detachment ID the VS Data names of the Detachment the frozen map joins it to', () => {
  const names = importNamesOf(
    {
      factions: [],
      detachments: { 'leagues-of-votann.needgaard-oathband': ['Needgaard Oathband', 'Needgaard-Eidbund'] },
      enhancements: [],
      dispositions: [],
      units: {},
    },
    {},
    {
      units: {},
      detachments: { '01b8-fa17-620e-8e79': 'leagues-of-votann.needgaard-oathband' },
      datasheetNames: new Map(),
      detachmentNames: new Map([['01b8-fa17-620e-8e79', ['Needgaârd Oathband']]]),
      entryNames: new Map(),
    },
  )
  expect(names.detachments.get('01b8-fa17-620e-8e79')).toContain('Needgaard-Eidbund')
})
