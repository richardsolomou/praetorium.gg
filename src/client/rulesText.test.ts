import { createHash } from 'node:crypto'
import { runInNewContext } from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TEXT_SOURCES_SCRIPT, applyTextSourceChoice, loadRuleText, textLoadFailure, textSourceChoiceFrom } from './rulesText'

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

  it('names a file that is not the pinned version as a mismatch', async () => {
    serve(file.replace('Units move.', 'Units fly.'))
    expect(await loadRuleText(text).catch(textLoadFailure)).toEqual({ reason: 'mismatch' })
  })

  it('names a file that is not a rules document as invalid', async () => {
    const other = JSON.stringify({ id: 'not-rules' })
    serve(other)
    const failure = await loadRuleText({ ...text, sha256: createHash('sha256').update(other).digest('hex') }).catch(textLoadFailure)
    expect(failure).toEqual({ reason: 'invalid' })
  })

  it('sends no cookies or referrer to the upstream host', async () => {
    serve(file)
    await loadRuleText(text)
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(text.url, { credentials: 'omit', referrerPolicy: 'no-referrer' })
  })
})

describe('the sources a reader has chosen', () => {
  it('has not decided while nothing is stored', () => {
    expect(textSourceChoiceFrom(null).decided).toBe(false)
  })

  it('counts loading no source as a decision', () => {
    expect(textSourceChoiceFrom('')).toEqual({ decided: true, sources: new Set() })
  })

  it('reads only the sources it knows', () => {
    expect(textSourceChoiceFrom('bsdata,elsewhere').sources).toEqual(new Set(['bsdata']))
  })
})

describe('the first frame’s choice', () => {
  /** The document attribute a page starts with when storage holds `stored`, as the head script sets it and as the app keeps it. */
  function attributes(stored: string | null | Error) {
    const fromScript: DOMStringMap = {}
    const fromApp: DOMStringMap = {}
    const localStorage = {
      getItem: () => {
        if (stored instanceof Error) throw stored
        return stored
      },
    }
    runInNewContext(TEXT_SOURCES_SCRIPT, { localStorage, document: { documentElement: { dataset: fromScript } } })
    vi.stubGlobal('document', { documentElement: { dataset: fromApp } })
    applyTextSourceChoice(textSourceChoiceFrom(stored instanceof Error ? null : stored))
    const sources = (dataset: DOMStringMap) => dataset.textSources?.split(' ').filter(Boolean).sort()
    return { script: sources(fromScript), app: sources(fromApp) }
  }

  it.each([null, '', 'bsdata', 'game-datacards,bsdata', 'bsdata,retired-source'])(
    'is the same from the head script and the app for %j',
    (stored) => {
      const { script, app } = attributes(stored)
      expect(script).toEqual(app)
    },
  )

  it('leaves an undecided device without the attribute', () => {
    expect(attributes(null).script).toBeUndefined()
  })

  it('reads storage that refuses as undecided', () => {
    expect(attributes(new Error('blocked')).script).toBeUndefined()
  })

  it('marks a device that chose none as decided', () => {
    expect(attributes('').script).toEqual([])
  })
})
