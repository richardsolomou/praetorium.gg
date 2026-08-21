import { describe, expect, it } from 'vitest'
import { withCounts } from './selection'

describe('laying counts over a selection', () => {
  const tree = { id: 'squad', count: 1, selections: [{ id: 'troopers', count: 1, selections: [{ id: 'trooper', count: 1 }] }] }

  it('sets the count at the end of the path', () => {
    const result = withCounts(tree, [{ path: ['troopers', 'trooper'], count: 9 }])
    expect(result.selections?.[0]?.selections?.[0]?.count).toBe(9)
  })

  it('creates the nodes a path names but the tree lacks', () => {
    const result = withCounts({ id: 'squad', count: 1 }, [{ path: ['troopers', 'trooper'], count: 5 }])
    expect(result.selections?.[0]?.selections?.[0]).toEqual({ id: 'trooper', count: 5 })
  })

  it('leaves siblings alone', () => {
    const withSergeant = { ...tree, selections: [...tree.selections, { id: 'sergeant', count: 1 }] }
    const result = withCounts(withSergeant, [{ path: ['troopers', 'trooper'], count: 9 }])
    expect(result.selections?.find((child) => child.id === 'sergeant')?.count).toBe(1)
  })
})
