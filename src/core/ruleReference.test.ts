import { describe, expect, it } from 'vitest'
import { bracketedRuleReferences, normalizeRuleReference, ruleReferenceKeys, ruleReferenceMatches } from './ruleReference'

describe('rule references', () => {
  it.each([
    '[Anti-Beast 2+]',
    '[ANTI-BEASTS 3+]',
    '[ANTI-CHAOS 4+]',
    '[ANTI-CHAOS 5+]',
    '[ANTI-CHARACTER 4+]',
    '[ANTI-DAEMON 3+]',
    '[ANTI-FORTIFICATION 4+]',
    '[ANTI-INFANTRY 2+]',
    '[ANTI-INFANTRY 3+]',
    '[ANTI-INFANTRY 4+]',
    '[ANTI-INFANTRY 5+]',
    '[Anti-Monster 2+]',
    '[ANTI-MONSTER 3+]',
    '[ANTI-MONSTER 4+]',
    '[ANTI-MOUNTED 3+]',
    '[ANTI-MOUNTED 4+]',
    '[ANTI-TITANIC 3+]',
    '[ANTI-PSYKER 4+]',
    '[ANTI-UNBOUND ADVERSARIES 4+]',
    '[Anti-Vehicle 2+]',
    '[ANTI-VEHICLE 3+]',
    '[ANTI-VEHICLE 4+]',
    '[ANTI‑CHARACTER 2+]',
    '[ANTI‑MONSTER 5+]',
    '[ANTI‑VEHICLE 5+]',
  ])('matches the parameterized Anti rule in %s', (reference) => {
    expect(ruleReferenceMatches(reference, 'Anti')).toBe(true)
  })

  it('matches parameterized rules separated by spaces', () => {
    expect(ruleReferenceMatches('[SUSTAINED HITS D3]', 'Sustained Hits')).toBe(true)
  })

  it.each(['Rapid Fire 1', 'Rapid Fire D6+3', 'Melta 4', 'Anti Vehicle 3+', 'Scouts 6"'])(
    'reads %s as the rule it parameterizes',
    (reference) => {
      const rule = reference.startsWith('Anti') ? 'Anti' : reference.replace(/\s+\S+$/, '')
      expect(ruleReferenceMatches(reference, rule)).toBe(true)
    },
  )

  /**
   * A datasheet's own name can open with a rule's name. Reading it as that rule put
   * the Heavy weapon rule on the Heavy Intercessor Squad keyword, and on 74 sheets
   * the only tooltip in the keyword row was that mistake.
   */
  it.each([
    ['Heavy Intercessor Squad', 'Heavy'],
    ['Heavy Mortar Team', 'Heavy'],
    ['Twin-linked Lascannon', 'Twin'],
  ])('does not read %s as the rule %s', (reference, rule) => {
    expect(ruleReferenceMatches(reference, rule)).toBe(false)
  })

  it('discovers source references with either hyphen form', () => {
    expect(bracketedRuleReferences('Gain [ANTI‑MONSTER 5+] and [ANTI-INFANTRY 3+].')).toEqual(['ANTI‑MONSTER 5+', 'ANTI-INFANTRY 3+'])
  })

  /** An index keyed by normalized rule name must answer exactly what the matcher answers. */
  describe('ruleReferenceKeys', () => {
    const references = [
      '[ANTI-INFANTRY 4+]',
      '[SUSTAINED HITS D3]',
      'Rapid Fire D6+3',
      'Scouts 6"',
      'Anti-4+',
      'Heavy Intercessor Squad',
      'Twin-linked Lascannon',
      'Feel No Pain 5+',
      'Deadly Demise D3',
      'Anti',
    ]
    const rules = [
      'Anti',
      'Anti-Infantry',
      'Sustained Hits',
      'Rapid Fire',
      'Scouts',
      'Heavy',
      'Twin',
      'Heavy Intercessor Squad',
      'Feel No Pain',
      'Deadly Demise',
      'Lethal Hits',
    ]
    it.each(references.flatMap((reference) => rules.map((rule) => [reference, rule] as const)))(
      'agrees with ruleReferenceMatches for %s against %s',
      (reference, rule) => {
        const indexed = ruleReferenceKeys(reference).includes(normalizeRuleReference(rule))
        expect(indexed).toBe(ruleReferenceMatches(reference, rule))
      },
    )
  })
})
