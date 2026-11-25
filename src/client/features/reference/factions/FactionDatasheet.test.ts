import { type PropsWithChildren, createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { Abilities, ProfileTable, Relationships, TransportReference } from './FactionDatasheet'
import { InvulnerableSaves, shownSaves } from '../../../components/InvulnerableSaves'
import { DatasheetUnit, datasheetUnit } from '../../../components/UnitFromVsData'
import { ruleUnitsQuery } from '../../../queries/references'
import type { VsDataInvulnerableSave, VsDataUnits } from '../../../../shared/vsData'

// Summaries link to the core rules they name.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: PropsWithChildren) => createElement('a', null, children),
}))

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

// A transport rule shows only where it has a summary, which it asks for.
const withQueries = (element: ReturnType<typeof createElement>) =>
  createElement(QueryClientProvider, { client: new QueryClient() }, element)

it('anchors structured transport profiles beside transport prose', () => {
  const markup = renderToStaticMarkup(
    withQueries(
      createElement(TransportReference, {
        transport: 'Carries twelve models.',
        profiles: [{ id: 'capacity' }],
        abilities: [],
        rules: [],
      }),
    ),
  )

  expect(markup).toContain('id="profile-capacity"')
})

it('leaves the transport rule to the abilities when they already print it', () => {
  const markup = renderToStaticMarkup(
    withQueries(
      createElement(TransportReference, {
        transport: 'Carries twelve models.',
        profiles: [],
        abilities: [{ name: 'TRANSPORT' }],
        rules: [],
      }),
    ),
  )

  expect(markup).not.toContain('Carries twelve models.')
})

it('shows VS Data’s summary of a Transport ability whose capacity it cannot type', () => {
  const client = new QueryClient()
  const units: VsDataUnits = {
    units: { manta: { id: 'tau-empire.manta', sizes: [1], models: [], options: [] } },
    abilities: { 'tau-empire.manta.transport': { blocks: [{ paragraph: [{ text: 'It carries three loads at once.' }] }], questions: [] } },
    aliases: {},
  }
  client.setQueryData(ruleUnitsQuery(null).queryKey, units)
  const markup = renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(
        DatasheetUnit.Provider,
        { value: datasheetUnit('cat', 'manta') },
        createElement(TransportReference, {
          transport: 'Carries twelve models.',
          profiles: [],
          abilities: [],
          rules: [],
          catalogueId: 'cat',
          entryId: 'manta',
        }),
      ),
    ),
  )

  expect(markup).toContain('It carries three loads at once.')
})

it('shows which attacks and model an invulnerable save is for, and its condition', () => {
  const saves: VsDataInvulnerableSave[] = [
    {
      profile: 'drukhari.wyches',
      roll: 6,
      against: 'ranged',
      conditional: true,
      summary: { blocks: [{ paragraph: [{ text: 'Against melee attacks, this save is 4+.' }] }], questions: [] },
    },
    { profile: 'adepta-sororitas.repentia-squad.repentia-superior', model: 'Repentia Superior', roll: 6 },
  ]
  const markup = renderToStaticMarkup(createElement(InvulnerableSaves, { saves: shownSaves({ profiles: [] }, saves) }))
  expect(
    ['Against ranged attacks', 'Against melee attacks, this save is 4+.', 'Repentia Superior'].every((text) => markup.includes(text)),
  ).toBe(true)
})
