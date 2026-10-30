import { expect, it } from 'vitest'
import { packRuntimeData, unpackRuntimeData } from './runtimeData'
import { shareRuntimeData, restoreRuntimeData } from './sharedRuntimeData'

it('shares unchanged records after upstream reorders an array', () => {
  const base = [
    { id: 'first', description: 'First rule' },
    { id: 'second', description: 'Second rule' },
  ]
  const value = [base[1]!, base[0]!]
  const shared = shareRuntimeData(value, base)

  expect({ shared, restored: restoreRuntimeData(shared, base) }).toEqual({
    shared: [{ $praetoriumBase: ['1'] }, { $praetoriumBase: ['0'] }],
    restored: value,
  })
})

it('shares identical rules while retaining changed and added faction records', () => {
  const base = packRuntimeData(
    new Map([
      ['one', { rule: 'One' }],
      ['two', { rule: 'Two' }],
    ]),
  )
  const changed = new Map([
    ['one', { rule: 'One' }],
    ['two', { rule: 'New' }],
    ['three', { rule: 'Three' }],
  ])
  const shared = shareRuntimeData(packRuntimeData(changed), base)
  expect(unpackRuntimeData(restoreRuntimeData(shared, base))).toEqual(changed)
  expect(JSON.stringify(shared)).toContain('$praetoriumBase')
})

it('shares a completely unchanged runtime field', () => {
  expect(shareRuntimeData({ rules: ['unchanged'] }, { rules: ['unchanged'] })).toEqual({ $praetoriumBase: [] })
})

it('does not restore a removed rule from the base version', () => {
  expect(restoreRuntimeData(shareRuntimeData({ rules: [] }, { rules: ['removed'] }), { rules: ['removed'] })).toEqual({ rules: [] })
})

it('refuses references to inherited object properties', () => {
  expect(() => restoreRuntimeData({ $praetoriumBase: ['__proto__'] }, {})).toThrow('Missing shared runtime data')
})

it('refuses ambiguous reference records', () => {
  expect(() => restoreRuntimeData({ $praetoriumBase: [], other: true }, {})).toThrow('Invalid shared runtime data')
})

it('refuses source records that could impersonate references', () => {
  expect(() => shareRuntimeData({ $praetoriumBase: [] }, null)).toThrow('Reserved shared-data field')
})

it('refuses nested reserved fields even when the entire source matches its base', () => {
  const source = [{ id: 'record', nested: { $praetoriumBase: [] } }]

  expect(() => shareRuntimeData(source, source)).toThrow('Reserved shared-data field')
})

it('bounds repeated references by their expanded size', () => {
  expect(() => restoreRuntimeData([{ $praetoriumBase: [] }, { $praetoriumBase: [] }], ['large'], { remaining: 10 })).toThrow('size limit')
})
