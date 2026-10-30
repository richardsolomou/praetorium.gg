import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CombatRule } from '../../../core/combatRules'
import { textToken } from '../../../shared/sourceText'
import { loadTextFile, registerTextSources } from '../../sourceText'
import { missingRuleText, readableRules } from './readableRules'

const words = 'Each time a model in this unit makes an attack, re-roll a Hit roll of 1.'
const tokenFor = (value: string) =>
  textToken({ file: '000000aa', transform: 'plain', hash: createHash('sha256').update(value).digest('hex').slice(0, 16) })
const rule = (description: string, keywords: string[] = []): CombatRule => ({
  id: 'stratagem:reroll',
  name: 'Re-roll',
  source: '1 CP',
  description,
  scope: 'stratagem',
  phases: ['ranged'],
  keywords,
})

afterEach(() => vi.unstubAllGlobals())

describe('rules the simulator can compile on this device', () => {
  it('keeps a rule that carries its own words', () => {
    expect(readableRules([rule(words)])).toEqual([rule(words)])
  })

  it('leaves out a rule whose words this device has not loaded', () => {
    expect(readableRules([rule(tokenFor(words))])).toEqual([])
  })

  it('compiles a rule from the words it loaded', async () => {
    vi.stubGlobal('localStorage', { getItem: () => 'bsdata' })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ effect: words }))),
    )
    registerTextSources({ '000000aa': { url: 'https://raw.githubusercontent.com/owner/repo/sha/rules.json', source: 'bsdata' } })
    await loadTextFile('000000aa')
    expect(readableRules([rule(tokenFor(words))]).map((read) => read.description)).toEqual([words])
  })
})

it('says a side is missing rules whose source this device has not chosen', () => {
  vi.stubGlobal('localStorage', { getItem: () => '' })
  registerTextSources({ '000000bb': { url: 'https://raw.githubusercontent.com/owner/repo/sha/other.json', source: 'game-datacards' } })
  const unread = textToken({ file: '000000bb', transform: 'plain', hash: '0000000000000000' })
  expect(missingRuleText({ rules: [rule(unread)], companions: [] })).toBe('unchosen')
})
