import { describe, expect, it } from 'vitest'
import { type Command, reduceBattle } from '../core/battle'
import { ALICE, BOB, CAROL, builtRoster, log, roster } from '../core/battle.fixtures'
import { battleView } from '../core/battleView'
import type { ServiceRecord } from '../core/serviceRecord'
import { battlePreview, pageMeta, playerPreview, rosterExposure, rosterPreview, siteMeta } from './linkPreview'

const DAVE = 'dave'
const NAMES = [
  { id: ALICE, name: 'Alice' },
  { id: BOB, name: 'Bob' },
  { id: CAROL, name: 'Carol' },
  { id: DAVE, name: 'Dave' },
]
const ORIGIN = 'https://praetorium.example'
const factionName = (catalogueId: string) => (catalogueId === 'cat' ? 'Necrons' : null)

/** What a spectator is shown of a battle, which is what a crawler reads. */
function spectated(players: string[], entries: [string, Command][], sides?: number[]) {
  const state = reduceBattle(players, log(...entries), sides)
  return battlePreview(battleView({ token: 'tok' }, NAMES, state, ''), factionName)
}

const live: [string, Command][] = [
  [ALICE, builtRoster('Szarekhan', ['Warriors'])],
  [BOB, roster('Waaagh')],
  [ALICE, { kind: 'begin-battle', firstPlayerId: ALICE }],
  [ALICE, { kind: 'correct-player', playerId: ALICE, resource: 'primary', delta: 15 }],
  [ALICE, { kind: 'correct-player', playerId: BOB, resource: 'primary', delta: 5 }],
]

const content = (meta: ReturnType<typeof pageMeta>, key: string) =>
  meta.find((tag) => ('property' in tag && tag.property === key) || ('name' in tag && tag.name === key))?.content

describe('a battle preview', () => {
  it('names each player beside the army they brought', () => {
    expect(spectated([ALICE, BOB], live).title).toBe('Alice (Necrons) vs Bob')
  })

  it('describes a live battle by its round, phase and score', () => {
    expect(spectated([ALICE, BOB], live).description).toBe('Live · Round 1 · Command phase · 15–5')
  })

  it('shows no score while the table is still being set', () => {
    expect(spectated([ALICE, BOB], [[ALICE, roster('Szarekhan')]]).card).toMatchObject({
      stage: 'Setting up',
      sides: [{ score: null }, { score: null }],
    })
  })

  it('says who won a finished battle', () => {
    const finished = spectated([ALICE, BOB], [...live, [BOB, { kind: 'end-battle', reason: 'conceded', concededBy: BOB }]])
    expect(finished.description).toBe('Finished · Alice wins by concession')
  })

  it('puts allies on one side of a doubles table', () => {
    expect(spectated([ALICE, BOB, CAROL, DAVE], [], [0, 1, 0, 1]).title).toBe('Alice & Carol vs Bob & Dave')
  })

  it('bounds a name however long it was typed', () => {
    const state = reduceBattle([ALICE, BOB], log())
    const view = battleView({ token: 'tok' }, [{ id: ALICE, name: 'A'.repeat(500) }, NAMES[1]!], state, '')
    expect(battlePreview(view, factionName).card).toMatchObject({ sides: [{ armies: [{ player: `${'A'.repeat(79)}…` }] }, {}] })
  })
})

describe('page metadata', () => {
  it('links the page and its image absolutely', () => {
    const meta = pageMeta(ORIGIN, {
      title: 'Battle',
      description: 'd',
      path: '/battles/tok',
      image: { path: '/api/previews/battles/tok', alt: 'a' },
    })
    expect([content(meta, 'og:url'), content(meta, 'og:image')]).toEqual([`${ORIGIN}/battles/tok`, `${ORIGIN}/api/previews/battles/tok`])
  })

  it('states the image size unfurling clients lay out before loading it', () => {
    const meta = pageMeta(ORIGIN, { title: 't', description: 'd', image: { path: '/p', alt: 'a' } })
    expect([content(meta, 'og:image:width'), content(meta, 'og:image:height')]).toEqual(['1200', '630'])
  })

  it('leaves the instance card in place when a page has no image of its own', () => {
    expect(content(pageMeta(ORIGIN, { title: 't', description: 'd' }), 'og:image')).toBeUndefined()
  })

  it('asks search engines to pass over a page only when told to', () => {
    expect(
      [pageMeta(ORIGIN, { title: 't', description: 'd', noindex: true }), pageMeta(ORIGIN, { title: 't', description: 'd' })].map((meta) =>
        content(meta, 'robots'),
      ),
    ).toEqual(['noindex', undefined])
  })

  it('gives every page a large card by default', () => {
    const meta = siteMeta(ORIGIN)
    expect([content(meta, 'twitter:card'), content(meta, 'og:image')]).toEqual(['summary_large_image', `${ORIGIN}/api/previews/site`])
  })
})

describe('a roster preview', () => {
  const price = { label: 'HL 2K - C’tan', points: 1995, detachments: [{ name: 'Hypercrypt Legion' }] }

  it('reads a name its owner typed', () => {
    expect(rosterPreview({ name: 'Tomb World', limit: 2000 }, { displayName: 'Necrons' }, price).description).toBe(
      'Necrons · Hypercrypt Legion · 1995 / 2000 points',
    )
  })

  it('falls back to the folded label for a list nobody named', () => {
    expect(rosterPreview({ name: '  ', limit: 2000 }, null, price).title).toBe('HL 2K - C’tan')
  })

  it('names only the size when the army cannot be priced', () => {
    expect(rosterPreview({ name: 'Tomb World', limit: 2000 }, null, null).description).toBe('2000 points')
  })

  it.each([
    ['private', { image: false, noindex: true }],
    ['unlisted', { image: true, noindex: true }],
    ['public', { image: true, noindex: false }],
  ] as const)('exposes a %s list accordingly', (visibility, exposure) => {
    expect(rosterExposure(visibility)).toEqual(exposure)
  })
})

describe('a player preview', () => {
  const record = { battles: 3, won: 2, lost: 1, drawn: 0 } as ServiceRecord

  it('says nothing about a player whose battles this reader may not watch', () => {
    expect(playerPreview('Alice', { ...record, battles: 0, won: 0, lost: 0 }, { days: 90, overall: null, factions: [] }).description).toBe(
      'A Warhammer 40,000 player on Praetorium.',
    )
  })

  it('names a leaderboard place the leaderboard itself prints, record or not', () => {
    const rankings = { days: 90, overall: { faction: null, place: 3, of: 4, standing: {} as never }, factions: [] }
    expect(playerPreview('Alice', null, rankings).description).toBe('Place 3 of 4 on the leaderboard.')
  })

  it('reads the record and the leaderboard place a reader may see', () => {
    const rankings = { days: 90, overall: { faction: null, place: 2, of: 14, standing: {} as never }, factions: [] }
    expect(playerPreview('Alice', record, rankings).description).toBe('2 wins and 1 loss from 3 battles. Place 2 of 14 on the leaderboard.')
  })
})
