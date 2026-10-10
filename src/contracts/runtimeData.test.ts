import { describe, expect, it } from 'vitest'
import { packRuntimeData, unpackRuntimeData } from './runtimeData'

describe('saved runtime data', () => {
  it('restores nested catalogue maps and sets', () => {
    const data = new Map([['faction', { definitions: new Map([['unit', { ids: new Set(['one', 'two']) }]]) }]])
    expect(unpackRuntimeData(packRuntimeData(data))).toEqual(data)
  })

  it('refuses source objects that could impersonate a map', () => {
    expect(() => packRuntimeData({ $praetoriumMap: [['key', 'value']] })).toThrow('Reserved saved-data field')
  })
})
