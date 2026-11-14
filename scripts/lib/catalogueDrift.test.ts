import { expect, it } from 'vitest'
import { characteristic, classify, kdcWeaponKeywords, keywordList, weaponProfileName } from './catalogueDrift'

it('reads a save and a skill without their plus', () => {
  expect(['3+', '3', 3].map(characteristic)).toEqual(['3', '3', '3'])
})

it('keeps the plus of a dice expression', () => {
  expect(characteristic('D6+1')).toBe('d6+1')
})

it('reads 40kdc keywords as a card prints them', () => {
  expect(
    kdcWeaponKeywords([
      { keyword_id: 'anti', parameters: { target_keyword: 'Monster', threshold: 4 } },
      { keyword_id: 'anti', parameters: { target_keyword: 'Vehicle', threshold: 4 } },
      { keyword_id: 'lethal-hits', parameters: { excluded_target_keywords: ['Monster', 'Vehicle'] } },
    ]),
  ).toBe(keywordList(['Anti-Monster/Vehicle 4+', 'Lethal Hits (non-Monster/Vehicle)']))
})

it('names a weapon profile without the mode its kind says', () => {
  expect(weaponProfileName('Lashes of torment – Ranged')).toBe('Lashes of torment')
})

it('calls a value both sources give against ours a likely edit', () => {
  expect(classify({ ours: '4', gdcPin: '5', gdcHead: '5', kdc: '5' })).toBe('likely')
})

it('ranks Game Datacards above 40kdc when they disagree with each other', () => {
  expect(classify({ ours: '4', gdcHead: '5', kdc: '6' })).toBe('gdc')
})

it('marks a value only 40kdc disputes as low confidence', () => {
  expect(classify({ ours: '4', gdcHead: '4', kdc: '5' })).toBe('low')
})
