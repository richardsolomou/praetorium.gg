import { describe, expect, it } from 'vitest'
import { ROSTER_NAME_MAX_LENGTH } from './battle'
import { variantCards, variantGroups, variantName } from './rosterVariants'

const roster = (id: string, baseRosterId: string | null = null) => ({ id, baseRosterId })
const shape = (rows: ReturnType<typeof variantGroups<ReturnType<typeof roster>>>) =>
  rows.map(({ roster: { id }, variant }) => (variant ? `  ${id}` : id))

describe('the name a new variant receives', () => {
  it('numbers the first variant after its base', () => {
    expect(variantName('Gladius 2K', ['Gladius 2K'])).toBe('Gladius 2K · 2')
  })

  it('takes the first number no variant of the group holds', () => {
    expect(variantName('Gladius 2K', ['Gladius 2K', 'Gladius 2K · 2', 'Gladius 2K · 4'])).toBe('Gladius 2K · 3')
  })

  it('shortens a long base name so the number still fits', () => {
    const name = variantName('x'.repeat(ROSTER_NAME_MAX_LENGTH), [])
    expect(name).toBe(`${'x'.repeat(ROSTER_NAME_MAX_LENGTH - 4)} · 2`)
  })
})

describe('the library order of variant groups', () => {
  it('leaves lists without variants in their sorted order', () => {
    expect(shape(variantGroups([roster('a'), roster('b')]))).toEqual(['a', 'b'])
  })

  it('places each variant under its base', () => {
    expect(shape(variantGroups([roster('a'), roster('b'), roster('a2', 'a')]))).toEqual(['a', '  a2', 'b'])
  })

  it('places a group where its first member sorts', () => {
    expect(shape(variantGroups([roster('b'), roster('a2', 'a'), roster('a')]))).toEqual(['b', 'a', '  a2'])
  })

  it('keeps the sorted order among variants of one base', () => {
    expect(shape(variantGroups([roster('a3', 'a'), roster('a'), roster('a2', 'a')]))).toEqual(['a', '  a3', '  a2'])
  })

  it('heads a group whose base was deleted with its first member', () => {
    expect(shape(variantGroups([roster('a3', 'a'), roster('a2', 'a')]))).toEqual(['a3', '  a2'])
  })
})

describe('the cards a grouped list is drawn as', () => {
  it('gathers each base with the variants beneath it', () => {
    const cards = variantCards(variantGroups([roster('a'), roster('a2', 'a'), roster('b')]))
    expect(cards.map(({ head, variants }) => [head.roster.id, variants.map((variant) => variant.roster.id)])).toEqual([
      ['a', ['a2']],
      ['b', []],
    ])
  })

  it('keeps each entry’s position in the list', () => {
    const cards = variantCards(variantGroups([roster('a'), roster('a2', 'a'), roster('b')]))
    expect(cards.flatMap(({ head, variants }) => [head.index, ...variants.map((variant) => variant.index)])).toEqual([0, 1, 2])
  })
})
