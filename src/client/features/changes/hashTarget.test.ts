import { describe, expect, it } from 'vitest'
import { hashTarget } from './hashTarget'

type Node = { id: string; tagName: string; open?: boolean; parentElement: Node | null }

/** A page of rows: `main` holding a closed row and an open one, each holding a faction block. */
function page() {
  const main: Node = { id: 'main', tagName: 'MAIN', parentElement: null }
  const closed: Node = { id: 'update-2026-07-22-aaaaaaaa', tagName: 'DETAILS', open: false, parentElement: main }
  const open: Node = { id: 'update-2026-07-23-bbbbbbbb', tagName: 'DETAILS', open: true, parentElement: main }
  const inClosed: Node = { id: 'update-2026-07-22-aaaaaaaa-orks', tagName: 'DIV', parentElement: closed }
  const inOpen: Node = { id: 'update-2026-07-23-bbbbbbbb-orks', tagName: 'DIV', parentElement: open }
  const nodes = [main, closed, open, inClosed, inOpen]
  return { byId: (id: string) => nodes.find((node) => node.id === id) ?? null, closed, open, inClosed, inOpen }
}

const ids = (nodes: readonly Node[] | undefined) => nodes?.map((node) => node.id)

describe('the target of an address’s fragment', () => {
  it('is a faction block, with the closed row around it to open', () => {
    const { byId } = page()
    const found = hashTarget('#update-2026-07-22-aaaaaaaa-orks', byId)

    expect({ target: found?.target.id, closed: ids(found?.closed) }).toEqual({
      target: 'update-2026-07-22-aaaaaaaa-orks',
      closed: ['update-2026-07-22-aaaaaaaa'],
    })
  })

  it('opens a closed row that is itself the target', () => {
    expect(ids(hashTarget('#update-2026-07-22-aaaaaaaa', page().byId)?.closed)).toEqual(['update-2026-07-22-aaaaaaaa'])
  })

  it('opens nothing when the row around the target is already open', () => {
    expect(hashTarget('#update-2026-07-23-bbbbbbbb-orks', page().byId)?.closed).toEqual([])
  })

  it('reads a percent-encoded fragment', () => {
    expect(hashTarget('#update-2026-07-22-aaaaaaaa%2Dorks', page().byId)?.target.id).toBe('update-2026-07-22-aaaaaaaa-orks')
  })

  it('is nothing for an empty fragment', () => {
    expect(hashTarget('', page().byId)).toBeNull()
  })

  it('is nothing for a fragment nothing on the page answers to', () => {
    expect(hashTarget('#update-2020-01-01-00000000', page().byId)).toBeNull()
  })

  it('is nothing for a fragment that is not valid percent-encoding', () => {
    expect(hashTarget('#%E0%A4%A', page().byId)).toBeNull()
  })
})
