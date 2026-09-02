import { describe, expect, it } from 'vitest'
import { shouldRequestAdvance } from './advance'

const prompts = {
  scoring: true,
  secretMission: false,
  tacticalDiscard: false,
  fireOverwatch: false,
}

describe('battle advance prompts', () => {
  it('requests the prompt before scoring starts', () => {
    expect(shouldRequestAdvance(false, prompts)).toBe(true)
  })

  it('does not request the prompt again after scoring finishes', () => {
    expect(shouldRequestAdvance(true, prompts)).toBe(false)
  })
})
