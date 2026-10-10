import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FactionMark, factionColour } from './FactionMark'

describe('faction colors', () => {
  it('uses the faction palette', () => {
    expect(factionColour('blood-angels')).toBe('#7c1414')
  })

  it('uses a neutral color for a new faction', () => {
    expect(factionColour('unknown')).toBe('#8b918a')
  })

  it.each(['custodes-preview', 'mfm-2026'])('retains the faction colour for rules version %s', (version) => {
    expect(factionColour(`${version}~adeptus-custodes`)).toBe('#bf9b30')
  })

  it('uses the faction name when its versioned route contains a catalogue ID', () => {
    expect(factionColour('custodes-11e~1f19-6509-d906-ca10', 'Adeptus Custodes')).toBe('#bf9b30')
  })
})

it('shows the selected rules version beside the faction mark', () => {
  const markup = renderToStaticMarkup(
    createElement(FactionMark, {
      id: 'custodes-11e~1f19-6509-d906-ca10',
      name: 'Adeptus Custodes',
      icon: null,
      edition: { id: 'custodes-11e', name: 'Custodes codex', status: 'preview' },
    }),
  )
  expect(markup).toContain('aria-label="Rules version: Custodes codex · Preview"')
})
