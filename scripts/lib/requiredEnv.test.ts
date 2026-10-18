import { describe, expect, it } from 'vitest'
import { requiredEnv } from './requiredEnv'

describe('requiredEnv', () => {
  it('returns the trimmed value', () => {
    expect(requiredEnv('TOKEN', { TOKEN: ' secret\n' })).toBe('secret')
  })

  it('refuses an unset value', () => {
    expect(() => requiredEnv('TOKEN', {})).toThrow('TOKEN is required')
  })

  it('refuses a blank value', () => {
    expect(() => requiredEnv('TOKEN', { TOKEN: ' \n' })).toThrow('TOKEN is required')
  })

  it('refuses a multi-line value', () => {
    expect(() => requiredEnv('TOKEN', { TOKEN: 'one\ntwo' })).toThrow('TOKEN must be one line')
  })
})
