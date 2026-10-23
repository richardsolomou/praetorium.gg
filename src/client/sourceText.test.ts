import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { textToken } from '../shared/sourceText'
import type { TextSource } from '../shared/sourceText'
import { textSourceChoiceFrom } from './rulesText'
import { loadTextFile, loadedText, loadedWords, registerTextSources, retryFailedTextFiles } from './sourceText'

const capture = vi.hoisted(() => vi.fn())
vi.mock('posthog-js', () => ({ posthog: { capture } }))

const words = 'Re-roll a Hit roll of 1.'
const hash = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 16)
const token = (file: string, value = words) => textToken({ file, transform: 'prose', hash: hash(value) })
const serve = (body: unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body))),
  )
const refuse = (status: number) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('', { status })),
  )

afterEach(() => {
  vi.unstubAllGlobals()
  capture.mockClear()
})

const all = textSourceChoiceFrom('bsdata,game-datacards')
const file = (id: string, source: TextSource = 'game-datacards') =>
  registerTextSources({ [id]: { url: `https://raw.githubusercontent.com/owner/repo/sha/${id}.json`, source } })

describe('rules text on this device', () => {
  // Runs first: no file list has arrived yet, so the source a text needs is not known.
  it('shows nothing of a text while no source is chosen', () => {
    expect(loadedText(`**Effect:** ${token('0000000a')}`, textSourceChoiceFrom(null))).toEqual({
      text: '**Effect:**',
      missing: 'unchosen',
    })
  })

  it('keeps a text unloaded while only another source is chosen', () => {
    file('00000010', 'bsdata')
    expect(loadedText(token('00000010'), textSourceChoiceFrom('game-datacards')).missing).toBe('unchosen')
  })

  it('waits for the file a token names', () => {
    file('0000000b')
    expect(loadedText(token('0000000b'), all).missing).toBe('loading')
  })

  it('shows the words of a loaded file whose string matches the token', async () => {
    serve({ effect: { en: words } })
    file('0000000c')
    await loadTextFile('0000000c')
    expect(loadedText(`**Effect:** ${token('0000000c')}`, all)).toEqual({ text: `**Effect:** ${words}`, missing: null })
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
    expect(loadedText(token('0000000d'), all)).toEqual({ text: '—', missing: 'unavailable' })
  })

  it('gives rules no words from a text it could only partly load', async () => {
    serve({ effect: { en: words } })
    file('0000000e')
    await loadTextFile('0000000e')
    expect(loadedWords(`${token('0000000e')} ${token('0000000e', 'Missing.')}`, all)).toBeNull()
  })
})

describe('a rules text file that fails to load', () => {
  it('says the text could not load rather than that it does not exist', async () => {
    refuse(503)
    file('00000020')
    await loadTextFile('00000020')
    expect(loadedText(`**Effect:** ${token('00000020')}`, all)).toEqual({ text: '**Effect:**', missing: 'failed' })
  })

  it('reports why without the error message', async () => {
    refuse(503)
    file('00000021', 'bsdata')
    await loadTextFile('00000021')
    expect(capture).toHaveBeenCalledWith('rules_text_load_failed', { source: 'bsdata', reason: 'http', status: 503 })
  })

  it('reports a dropped connection as a network failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    file('00000022')
    await loadTextFile('00000022')
    expect(capture).toHaveBeenCalledWith('rules_text_load_failed', { source: 'game-datacards', reason: 'network' })
  })

  it('does not ask again on its own', async () => {
    refuse(503)
    file('00000023')
    await loadTextFile('00000023')
    serve({ effect: { en: words } })
    await loadTextFile('00000023')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('keeps no copy of an answer that is not the file', async () => {
    const kept = new Map<string, Response>()
    vi.stubGlobal('caches', {
      open: async () => ({
        match: async (url: string) => kept.get(url)?.clone(),
        put: async (url: string, response: Response) => void kept.set(url, response),
      }),
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('Not the file')),
    )
    file('00000025')
    await loadTextFile('00000025')
    expect(kept.size).toBe(0)
  })

  it('loads when the reader tries again', async () => {
    refuse(503)
    file('00000024')
    await loadTextFile('00000024')
    serve({ effect: { en: words } })
    await retryFailedTextFiles()
    expect(loadedText(token('00000024'), all)).toEqual({ text: words, missing: null })
  })
})
