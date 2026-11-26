import { expect, it } from 'vitest'
import { importNamesOf } from './importNames'
import { normalized } from './importMismatch'

it('reads a Detachment BSData spells otherwise by its VS Data names, through the stored ID the frozen map joins', () => {
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
    },
  )
  expect(names.detachments.get(normalized('Needgaârd Oathband'))).toContain('Needgaard-Eidbund')
})
