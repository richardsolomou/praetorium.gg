import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Abilities, ProfileTable, Relationships, TransportReference } from './FactionDatasheet'

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

  it('renders aliases for source profiles that share displayed characteristics', () => {
    const profiles = [
      {
        id: 'one',
        name: 'One',
        type: 'Unit',
        kind: 'unit' as const,
        values: [{ name: 'M', value: '6"', kind: 'movement' as const }],
      },
    ]

    const markup = renderToStaticMarkup(
      createElement(ProfileTable, {
        title: 'Models',
        profiles,
        keywordRules: [],
        anchorIds: new Map([['one', ['one', 'duplicate']]]),
      }),
    )

    expect(markup).toContain('id="profile-duplicate"')
  })
})

it('anchors compact abilities and relationship abilities', () => {
  const abilityMarkup = renderToStaticMarkup(
    createElement(Abilities, {
      abilities: [{ id: 'deep-strike', name: 'Deep Strike', description: 'Arrive from reserves.', kind: 'core' }],
      rules: [],
    }),
  )
  const relationshipMarkup = renderToStaticMarkup(
    createElement(Relationships, {
      sheet: {
        attachments: [{ kind: 'leader', name: 'Squad', entryId: 'squad', route: null }],
        leaders: [],
        supporters: [],
      },
      abilityIds: ['leader'],
    }),
  )

  expect(abilityMarkup).toContain('id="ability-deep-strike"')
  expect(relationshipMarkup).toContain('id="ability-leader"')
})

it('anchors structured transport profiles beside transport prose', () => {
  const markup = renderToStaticMarkup(
    createElement(TransportReference, {
      transport: 'Carries twelve models.',
      profiles: [{ id: 'capacity' }],
      rules: [],
    }),
  )

  expect(markup).toContain('id="profile-capacity"')
})
