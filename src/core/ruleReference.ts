const BRACKETED_RULE = /\[([\p{L}\p{N} +'"’\p{Pd}]+)\]/gu

export function normalizeRuleReference(value: string) {
  return value
    .replace(/^\[|\]$/g, '')
    .replaceAll(/\^\^|\*/g, '')
    .normalize('NFKC')
    .replaceAll(/\p{Pd}/gu, '-')
    .replaceAll(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase()
}

/** A rule's parameter as a datasheet prints one: a number, a die, a threshold, a distance. */
const PARAMETER = /^d?\d+(?:\+\d+)?\+?"?$/

export function ruleReferenceMatches(reference: string, rule: string) {
  const wanted = normalizeRuleReference(reference)
  const candidate = normalizeRuleReference(rule)
  if (wanted === candidate) return true
  if (!wanted.startsWith(`${candidate} `) && !wanted.startsWith(`${candidate}-`)) return false
  /*
   * A longer reference names the same rule only when the rest of it is the rule's
   * parameter. `Anti-Infantry 4+` and `Anti Vehicle 3+` are both the Anti rule,
   * whatever they name in between, because they end in the threshold it takes.
   * `Heavy Intercessor Squad` is a datasheet that happens to open with the name of
   * one, and reading it as Heavy put that weapon's rule on the squad's own keyword.
   */
  return PARAMETER.test(
    wanted
      .slice(candidate.length + 1)
      .split(' ')
      .at(-1) ?? '',
  )
}

export function bracketedRuleReferences(text: string) {
  return [...text.matchAll(BRACKETED_RULE)].map((match) => match[1])
}

/**
 * The normalized rule names this reference can be asking for, for lookup in an
 * index keyed by normalized name. `ruleReferenceMatches(reference, rule)` holds
 * exactly when the normalized rule is one of these keys: itself, or — when the
 * reference ends in a parameter — any prefix cut at a space or hyphen.
 */
export function ruleReferenceKeys(reference: string) {
  const wanted = normalizeRuleReference(reference)
  const keys = [wanted]
  for (let at = 0; at < wanted.length; at += 1) {
    if (wanted[at] !== ' ' && wanted[at] !== '-') continue
    const rest = wanted.slice(at + 1)
    if (PARAMETER.test(rest.split(' ').at(-1) ?? '')) keys.push(wanted.slice(0, at))
  }
  return keys
}
