import { createElement, type PropsWithChildren } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { HomeView } from './HomeView'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: PropsWithChildren) => createElement('a', null, children),
}))

describe('home greeting', () => {
  it.each([
    ['an empty name', '', 'Welcome back'],
    ['a whitespace-only name', ' \t\n ', 'Welcome back'],
    ['a first name', 'Alex', 'Welcome back, Alex'],
    ['a full name with extra whitespace', '  Alex \t Smith  ', 'Welcome back, Alex'],
  ])('greets a player with %s', (_, name, greeting) => {
    const markup = renderToStaticMarkup(
      createElement(HomeView, {
        me: { id: 'player', name },
        mine: [],
        friends: [],
        open: [],
        rosters: [],
        rosterCount: 0,
        rostersDue: [],
        friendRequests: 0,
        leaders: null,
      }),
    )

    expect(markup.match(/<h1\b[^>]*>(.*?)<\/h1>/)?.[1]).toBe(greeting)
  })
})
