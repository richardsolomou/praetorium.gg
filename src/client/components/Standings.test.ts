import { createElement, type PropsWithChildren } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Standing } from '../../core/standings'
import { Standings } from './Standings'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: PropsWithChildren) => createElement('a', null, children),
  useNavigate: () => undefined,
}))

describe('standings', () => {
  it('shows a player avatar when they have one', () => {
    const row = {
      id: 'alice',
      name: 'Alice',
      image: 'https://example.test/alice.webp',
      battles: 1,
      won: 1,
      lost: 0,
      drawn: 0,
      net: 1,
      points: 55,
      lastPlayed: 10,
    } satisfies Standing

    const markup = renderToStaticMarkup(createElement(Standings, { table: { faction: null, players: 1, rows: [row] } }))

    expect(markup).toContain('<img src="https://example.test/alice.webp"')
  })
})
