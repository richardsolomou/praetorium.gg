import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ProfileTable } from './FactionDatasheet'

describe('faction datasheet profile table', () => {
  it('renders different source labels for one semantic characteristic in the same column', () => {
    const profiles = [
      {
        id: 'one',
        name: 'One',
        type: 'Unit',
        kind: 'unit' as const,
        values: [{ name: 'M', value: '6"', kind: 'movement' as const }],
      },
      {
        id: 'two',
        name: 'Two',
        type: 'Unit',
        kind: 'unit' as const,
        values: [{ name: 'Movement', value: '5"', kind: 'movement' as const }],
      },
    ]

    const markup = renderToStaticMarkup(createElement(ProfileTable, { title: 'Models', profiles, keywordRules: [] }))

    expect(markup.match(/<td/g)).toHaveLength(2)
    expect(markup).toContain('>M</th>')
    expect(markup).not.toContain('>Movement</th>')
    expect(markup).toContain('6&quot;')
    expect(markup).toContain('5&quot;')
    expect(markup).not.toContain('—')
  })
})
