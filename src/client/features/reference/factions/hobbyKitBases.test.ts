import { describe, expect, it } from 'vitest'
import { baseFootprints } from './hobbyKitBases'

describe('baseFootprints', () => {
  it('reads an oval base', () => {
    expect(baseFootprints('170 x 109mm Oval Base')).toEqual(['170x109'])
  })

  it('reads every size of a mixed unit once', () => {
    expect(baseFootprints('Proctor-Vigilant, Vigilants: 28.5mm\nCyber-mastiff: 25mm\nVigilant: 28.5mm')).toEqual(['28.5', '25'])
  })

  it('names nothing for a hull', () => {
    expect(baseFootprints('Hull')).toEqual([])
  })
})
