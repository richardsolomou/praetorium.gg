import { describe, expect, it } from 'vitest'
import { sealedEventRevealChecklist, type SealedEventRevealEntry } from '../../../core/sealedEvent'
import { checkDetail } from './SealedEventReadiness'

const entry = (userId: string, requiredLimit: number | null): SealedEventRevealEntry => ({
  userId,
  status: 'accepted',
  submitted: true,
  requiredLimit,
  teamId: null,
  dispositionOwed: false,
  warlordOwed: false,
})

describe('checkDetail', () => {
  it('asks for more players when a 2v1 has one solo and one allied player', () => {
    const sizes = sealedEventRevealChecklist({ format: '2v1', rosterLimit: 2_000 }, [entry('a', 2_000), entry('b', 1_000)], 0).find(
      (check) => check.step === 'sizes',
    )
    if (sizes?.step !== 'sizes') throw new Error('A 2v1 has a sizes check.')
    expect(checkDetail(sizes, '2v1', (userId) => userId)).toMatch(/^Invite more players/)
  })
})
