import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { textToken } from '../shared/sourceText'
import type { TextSource } from '../shared/sourceText'
import { textSourceChoiceFrom } from './rulesText'
import { loadTextFile, loadedText, loadedWords, registerTextSources } from './sourceText'

const words = 'Re-roll a Hit roll of 1.'
const hash = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 16)
const token = (file: string, value = words) => textToken({ file, transform: 'prose', hash: hash(value) })
const serve = (body: unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body))),
  )

afterEach(() => vi.unstubAllGlobals())

const all = textSourceChoiceFrom('bsdata,game-datacards')
const file = (id: string, source: TextSource = 'game-datacards') =>
  registerTextSources({ [id]: { url: `https://raw.githubusercontent.com/owner/repo/sha/${id}.json`, source } })

describe('rules text on this device', () => {
  // Runs first: no file list has arrived yet, so the source a text needs is not known.
  it('shows nothing of a text while no source is chosen', () => {
    expect(loadedText(`**Effect:** ${token('0000000a')}`, textSourceChoiceFrom(null))).toEqual({
      text: '**Effect:**',
      missing: 'unchosen',
      needs: [],
    })
  })

  it('names the source a text not chosen would load from', () => {
    file('00000010', 'bsdata')
    expect(loadedText(token('00000010'), textSourceChoiceFrom('game-datacards')).needs).toEqual(['bsdata'])
  })

  it('waits for the file a token names', () => {
    file('0000000b')
    expect(loadedText(token('0000000b'), all).missing).toBe('loading')
  })

  it('shows the words of a loaded file whose string matches the token', async () => {
    serve({ effect: { en: words } })
    file('0000000c')
    await loadTextFile('0000000c')
    expect(loadedText(`**Effect:** ${token('0000000c')}`, all)).toEqual({ text: `**Effect:** ${words}`, missing: null, needs: [] })
  })

  it('shows a loaded file’s words only while its source stays chosen', async () => {
    serve({ effect: { en: words } })
    file('00000011')
    await loadTextFile('00000011')
    expect(loadedText(token('00000011'), textSourceChoiceFrom('bsdata')).missing).toBe('unchosen')
  })

  it('shows one source’s words while the other is not chosen', async () => {
    serve({ effect: { en: words } })
    file('00000012', 'bsdata')
    await loadTextFile('00000012')
    expect(loadedText(token('00000012'), textSourceChoiceFrom('bsdata')).text).toBe(words)
  })

  it('gives rules the words of a text it fully loaded', async () => {
    serve({ effect: { en: words } })
    file('0000000f')
    await loadTextFile('0000000f')
    expect(loadedWords(token('0000000f'), all)).toBe(words)
  })

  it('marks a token the loaded file holds no string for', async () => {
    serve({ effect: { en: 'Something else entirely.' } })
    file('0000000d')
    await loadTextFile('0000000d')
    expect(loadedText(token('0000000d'), all)).toEqual({ text: '—', missing: 'unavailable', needs: [] })
  })

  it('gives rules no words from a text it could only partly load', async () => {
    serve({ effect: { en: words } })
    file('0000000e')
    await loadTextFile('0000000e')
    expect(loadedWords(`${token('0000000e')} ${token('0000000e', 'Missing.')}`, all)).toBeNull()
  })
})
