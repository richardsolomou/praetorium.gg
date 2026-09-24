import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { ProfileRules } from './ProfileRules'

it('anchors each rendered rule profile', () => {
  const markup = renderToStaticMarkup(
    createElement(ProfileRules, {
      profiles: [{ id: 'rule-profile', name: 'Rule', type: 'Abilities', values: [{ name: 'Rule', value: 'Rule text.' }] }],
      rules: [],
    }),
  )

  expect(markup).toContain('id="profile-rule-profile"')
})
