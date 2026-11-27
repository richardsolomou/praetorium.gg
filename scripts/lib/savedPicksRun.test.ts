import { describe, expect, it } from 'vitest'
import { rulesVersionOf } from './savedPicksRun'

describe('rulesVersionOf', () => {
  it('stops a run whose retained list loads as another rules version', () => {
    expect(() => rulesVersionOf('legacy-rosters~book', {}, 'mfm-1-6')).toThrow()
  })

  it('stops a run whose list does not load at all', () => {
    expect(() => rulesVersionOf('book', null, 'mfm-1-6')).toThrow()
  })
})
