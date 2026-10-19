import { expect, it } from 'vitest'
import { absoluteAgentLinks, absoluteAgentText } from './agentLinks'

it('resolves nested citation URLs without changing source data or stable identifiers', () => {
  const input = { id: '/stable-id', results: [{ url: '/rules/core#move', canonicalUrl: '/rules/core' }] }

  expect([absoluteAgentLinks(input, 'https://preview.praetorium.gg'), input]).toEqual([
    {
      id: '/stable-id',
      results: [{ url: 'https://preview.praetorium.gg/rules/core#move', canonicalUrl: 'https://preview.praetorium.gg/rules/core' }],
    },
    { id: '/stable-id', results: [{ url: '/rules/core#move', canonicalUrl: '/rules/core' }] },
  ])
})

it('preserves external source URLs and non-URL strings', () => {
  const input = { textSources: [{ url: 'https://upstream.example/rules.json' }], text: '/rules is a route', name: 'Praetorium' }

  expect(absoluteAgentLinks(input, 'https://praetorium.gg')).toEqual(input)
})

it('keeps JSON tool text consistent with structured citations', () => {
  expect(JSON.parse(absoluteAgentText('{"url":"/rules/core#move"}', 'https://praetorium.gg'))).toEqual({
    url: 'https://praetorium.gg/rules/core#move',
  })
})

it('resolves Markdown canonical citations without changing other text', () => {
  expect(absoluteAgentText('# Move\n\nCanonical URL: /rules/core#move\n', 'https://praetorium.gg')).toBe(
    '# Move\n\nCanonical URL: https://praetorium.gg/rules/core#move\n',
  )
})
