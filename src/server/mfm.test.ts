import { expect, it } from 'vitest'
import { mfmAttribution, type MfmIndex } from './mfm'

it.each(['1.4', '1.5'])('attributes MFM %s points to their source version', (version) => {
  const index: MfmIndex = new Map([['necrons', { slug: 'necrons', version, units: [] }]])

  expect(mfmAttribution(index)).toBe(`Points from BSData Munitorum Field Manual ${version}`)
})

it('does not claim one version when faction files disagree', () => {
  const index: MfmIndex = new Map([
    ['necrons', { slug: 'necrons', version: '1.4', units: [] }],
    ['space-marines', { slug: 'space-marines', version: '1.5', units: [] }],
  ])

  expect(mfmAttribution(index)).toBe('Points from BSData Munitorum Field Manual')
})
