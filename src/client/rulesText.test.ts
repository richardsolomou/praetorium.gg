import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadRuleText } from './rulesText'

const file = JSON.stringify({
  id: 'core-rules-document',
  name: { en: 'Core Rules' },
  cardType: 'coreRules',
  sections: [
    {
      id: 'section-moving',
      name: { en: '03. Moving' },
      containers: [{ id: 'container-moving', title: { en: 'Moving' }, components: [{ type: 'text', text: { en: 'Units move.' } }] }],
    },
  ],
})
const text = {
  url: 'https://raw.githubusercontent.com/owner/repo/sha/core/core_rules.json',
  sha256: createHash('sha256').update(file).digest('hex'),
}

const serve = (body: string, status = 200) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(body, { status })),
  )

afterEach(() => vi.unstubAllGlobals())

describe('loading a document’s rules text', () => {
  it('reads the text from the pinned file', async () => {
    serve(file)
    const document = await loadRuleText(text)
    expect(document.sections[0]?.entries[0]?.blocks).toEqual([{ kind: 'prose', markup: 'Units move.' }])
  })

  it('refuses a file that is not the one the outline was built from', async () => {
    serve(file.replace('Units move.', 'Units fly.'))
    await expect(loadRuleText(text)).rejects.toThrow('does not match the pinned version')
  })

  it('refuses an answer that is not the file', async () => {
    serve('Not Found', 404)
    await expect(loadRuleText(text)).rejects.toThrow('answered 404')
  })

  it('sends no cookies or referrer to the upstream host', async () => {
    serve(file)
    await loadRuleText(text)
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(text.url, { credentials: 'omit', referrerPolicy: 'no-referrer' })
  })
})
