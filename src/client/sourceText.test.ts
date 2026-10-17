import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { textToken } from '../shared/sourceText'
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

describe('rules text on this device', () => {
  it('shows nothing of a text the reader has not chosen to load', () => {
    expect(loadedText(`**Effect:** ${token('0000000a')}`, false)).toEqual({ text: '**Effect:**', missing: 'unchosen' })
  })

  it('waits for the file a token names', () => {
    registerTextSources({ '0000000b': 'https://raw.githubusercontent.com/owner/repo/sha/b.json' })
    expect(loadedText(token('0000000b'), true).missing).toBe('loading')
  })

  it('shows the words of a loaded file whose string matches the token', async () => {
    serve({ effect: { en: words } })
    registerTextSources({ '0000000c': 'https://raw.githubusercontent.com/owner/repo/sha/c.json' })
    await loadTextFile('0000000c')
    expect(loadedText(`**Effect:** ${token('0000000c')}`, true)).toEqual({ text: `**Effect:** ${words}`, missing: null })
  })

  it('gives rules the words of a text it fully loaded', async () => {
    serve({ effect: { en: words } })
    registerTextSources({ '0000000f': 'https://raw.githubusercontent.com/owner/repo/sha/f.json' })
    await loadTextFile('0000000f')
    expect(loadedWords(token('0000000f'), true)).toBe(words)
  })

  it('marks a token the loaded file holds no string for', async () => {
    serve({ effect: { en: 'Something else entirely.' } })
    registerTextSources({ '0000000d': 'https://raw.githubusercontent.com/owner/repo/sha/d.json' })
    await loadTextFile('0000000d')
    expect(loadedText(token('0000000d'), true)).toEqual({ text: '—', missing: 'unavailable' })
  })

  it('gives rules no words from a text it could only partly load', async () => {
    serve({ effect: { en: words } })
    registerTextSources({ '0000000e': 'https://raw.githubusercontent.com/owner/repo/sha/e.json' })
    await loadTextFile('0000000e')
    expect(loadedWords(`${token('0000000e')} ${token('0000000e', 'Missing.')}`, true)).toBeNull()
  })
})
