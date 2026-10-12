import { describe, expect, it } from 'vitest'
import {
  decodeRosterExchange,
  encodeRosterExchange,
  isRosterExchangeCode,
  ROSTER_EXCHANGE_MAX_CODE_LENGTH,
  rosterExchangeLink,
  RosterExchangeError,
} from './rosterExchange'

const roster = {
  name: 'Szarekhan Dynasty 2k',
  catalogueId: 'necrons',
  detachmentIds: ['awakened-dynasty'],
  disposition: 'take-and-hold',
  borrowedDetachmentId: null,
  limit: 2000,
  points: 1995,
  waivedRules: ['points-limit' as const],
  optionalRules: [],
  picks: [
    {
      entryId: 'overlord',
      choices: { 'overlord/weapon': 'voidscythe', 'overlord/enhancements': 'veil' },
      toggles: { 'overlord/warlord': 1 },
      attachedTo: 1,
    },
    { entryId: 'immortals', models: 10, spreads: { 'immortals/guns': { gauss: 0, tesla: 10 } } },
    { entryId: 'terminators', catalogueId: 'marines', models: 5 },
  ],
}

async function codeFor(payload: string, version = 1) {
  const stream = new Blob([new TextEncoder().encode(payload)]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer())
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `PR${version}.${btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')}`
}

const problemOf = (text: string) =>
  decodeRosterExchange(text).then(
    () => null,
    (error: unknown) => (error instanceof RosterExchangeError ? error.problem : error),
  )

describe('roster exchange codes', () => {
  it('round-trips a roster with equipment, attachments, Warlord, allies and setup', async () => {
    expect(await decodeRosterExchange(await encodeRosterExchange(roster))).toEqual(roster)
  })

  it('leaves unit notes behind', async () => {
    const annotated = { ...roster, picks: roster.picks.map((pick) => ({ ...pick, note: 'Private plan' })) }
    expect(await decodeRosterExchange(await encodeRosterExchange(annotated))).toEqual(roster)
  })

  it('reads a code carrying unit nicknames from before they were removed, without them', async () => {
    const legacy = { ...roster, picks: roster.picks.map((pick, at) => ({ ...pick, nickname: `Unit ${at + 1}` })) }
    expect(await decodeRosterExchange(await codeFor(JSON.stringify(legacy)))).toEqual(roster)
  })

  it('encodes the same roster to the same code', async () => {
    expect(await encodeRosterExchange(roster)).toBe(await encodeRosterExchange({ ...roster }))
  })

  it('leaves owner, visibility and preparation out of the code', async () => {
    const saved = {
      ...roster,
      id: 'roster-123',
      userId: 'user-secret-456',
      visibility: 'private',
      prep: { reminders: [{ key: 'private-note' }] },
    }
    expect(Object.keys(await decodeRosterExchange(await encodeRosterExchange(saved)))).toEqual(Object.keys(roster))
  })

  it('reads a code from its import link', async () => {
    const code = await encodeRosterExchange(roster)
    expect(await decodeRosterExchange(rosterExchangeLink('https://praetorium.gg', code))).toEqual(roster)
  })

  it('recognises codes and links but not army text', async () => {
    const code = await encodeRosterExchange(roster)
    expect(
      [code, `  ${rosterExchangeLink('http://127.0.0.1:3000', code)}\n`, 'PR1. Army list (2000 Points)'].map(isRosterExchangeCode),
    ).toEqual([true, true, false])
  })

  it('refuses a newer format version', async () => {
    const code = await encodeRosterExchange(roster)
    expect(await problemOf(code.replace(/^PR1\./, 'PR3.'))).toBe('unsupported-version')
  })

  it('keeps a roster without a custom points budget in format 1, which older apps read', async () => {
    expect((await encodeRosterExchange(roster)).startsWith('PR1.')).toBe(true)
  })

  it('writes a custom points budget in format 2, which older apps refuse rather than drop', async () => {
    expect((await encodeRosterExchange({ ...roster, pointsBudget: 1500 })).startsWith('PR2.')).toBe(true)
  })

  it('round-trips a custom points budget beside the battle size', async () => {
    const decoded = await decodeRosterExchange(await encodeRosterExchange({ ...roster, pointsBudget: 1500 }))
    expect([decoded.limit, decoded.pointsBudget]).toEqual([2000, 1500])
  })

  it('writes a budget equal to the battle size as no custom budget', async () => {
    expect(await encodeRosterExchange({ ...roster, pointsBudget: 2000 })).toBe(await encodeRosterExchange(roster))
  })

  it('refuses a custom points budget below the minimum as damaged', async () => {
    expect(await problemOf(await codeFor(JSON.stringify({ ...roster, pointsBudget: 499 }), 2))).toBe('malformed')
  })

  it('refuses a custom points budget on a battle size with a fixed total as damaged', async () => {
    expect(await problemOf(await codeFor(JSON.stringify({ ...roster, limit: 600, pointsBudget: 750 }), 2))).toBe('malformed')
  })

  it('names the format version it cannot read', async () => {
    const code = await encodeRosterExchange(roster)
    await expect(decodeRosterExchange(code.replace(/^PR1\./, 'PR7.'))).rejects.toThrow('uses format 7')
  })

  it('refuses a truncated code as damaged', async () => {
    const code = await encodeRosterExchange(roster)
    expect(await problemOf(code.slice(0, -12))).toBe('malformed')
  })

  it('refuses characters outside the code alphabet as damaged', async () => {
    const code = await encodeRosterExchange(roster)
    expect(await problemOf(`${code.slice(0, 20)}$${code.slice(21)}`)).toBe('malformed')
  })

  it('refuses compressed text that is not a roster', async () => {
    expect(await problemOf(await codeFor('{"name":"No picks"}'))).toBe('malformed')
  })

  it('refuses compressed text that is not JSON', async () => {
    expect(await problemOf(await codeFor('Army list (2000 Points)'))).toBe('malformed')
  })

  it('refuses a code longer than the limit before decompressing it', async () => {
    expect(await problemOf(`PR1.${'A'.repeat(ROSTER_EXCHANGE_MAX_CODE_LENGTH + 1)}`)).toBe('oversized')
  })

  it('stops decompressing a small code that expands beyond a roster', async () => {
    const code = await codeFor(JSON.stringify({ ...roster, name: ' '.repeat(150_000) }))
    expect([code.length < ROSTER_EXCHANGE_MAX_CODE_LENGTH, await problemOf(code)]).toEqual([true, 'oversized'])
  })

  it('accepts 100 entries', async () => {
    const picks = Array.from({ length: 100 }, () => ({ entryId: 'immortals' }))
    expect((await decodeRosterExchange(await codeFor(JSON.stringify({ ...roster, picks })))).picks).toHaveLength(100)
  })

  it('refuses more than 100 entries as oversized', async () => {
    const picks = Array.from({ length: 101 }, () => ({ entryId: 'immortals' }))
    expect(await problemOf(await codeFor(JSON.stringify({ ...roster, picks })))).toBe('oversized')
  })
})
