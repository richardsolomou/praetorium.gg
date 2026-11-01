import { type PropsWithChildren, createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { ProfileRules } from './ProfileRules'

// A prompt for rules text not loaded links to the data sources page.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: PropsWithChildren) => createElement('a', null, children),
}))

it('anchors each rendered rule profile', () => {
  const markup = renderToStaticMarkup(
    createElement(ProfileRules, {
      profiles: [{ id: 'rule-profile', name: 'Rule', type: 'Abilities', values: [{ name: 'Rule', value: 'Rule text.' }] }],
      rules: [],
    }),
  )

  expect(markup).toContain('id="profile-rule-profile"')
})

it('lays out a weapon-shaped profile such as a C’tan power as a weapon line', () => {
  const values = ['Range', 'A', 'BS', 'S', 'AP', 'D'].map((name) => ({ name, value: '1' }))
  const markup = renderToStaticMarkup(
    createElement(ProfileRules, {
      profiles: [{ id: 'cosmic-fire', name: 'Cosmic fire', type: "C'tan Powers", values }],
      rules: [],
      compact: true,
    }),
  )

  expect(markup).toContain('flex-1 text-center')
})
