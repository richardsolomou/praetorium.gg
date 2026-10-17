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
