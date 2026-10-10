import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { RulesVersionBadge } from './RulesVersionBadge'

it.each([
  { id: 'custodes-preview', name: 'Custodes codex', status: 'preview' as const, label: 'Custodes codex · Preview' },
  { id: 'mfm-2026', name: 'MFM October 2026', status: 'released' as const, label: 'MFM October 2026' },
  { id: 'balance-2025', name: 'Balance update 2025', status: 'retired' as const, label: 'Balance update 2025 · Previous' },
])('shows the named rules version for $name', ({ label, ...edition }) => {
  const markup = renderToStaticMarkup(createElement(RulesVersionBadge, { edition }))

  expect(markup).toContain(`aria-label="Rules version: ${label}"`)
})
