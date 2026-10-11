import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { RulesVersionBadge } from './RulesVersionBadge'

it.each([
  ['retired', 'archive', 'text-dim'],
  ['preview', 'flask-conical', 'text-discarded'],
] as const)('distinguishes %s rules by icon and colour', (status, icon, colour) => {
  const markup = renderToStaticMarkup(createElement(RulesVersionBadge, { edition: { id: 'rules', name: 'Rules', status } }))

  expect([markup.includes(`lucide-${icon}`), markup.includes(colour)]).toEqual([true, true])
})

it.each([
  { id: 'custodes-preview', name: 'Custodes codex', status: 'preview' as const, label: 'Custodes codex · Preview' },
  { id: 'balance-2025', name: 'Balance update 2025', status: 'retired' as const, label: 'Balance update 2025 · Archived' },
])('shows the named rules version for $name', ({ label, ...edition }) => {
  const markup = renderToStaticMarkup(createElement(RulesVersionBadge, { edition }))

  expect(markup).toContain(`aria-label="Rules version: ${label}"`)
})

it('keeps released faction icons free of a rules marker', () => {
  expect(
    renderToStaticMarkup(createElement(RulesVersionBadge, { edition: { id: 'current', name: 'Current rules', status: 'released' } })),
  ).toBe('')
})
