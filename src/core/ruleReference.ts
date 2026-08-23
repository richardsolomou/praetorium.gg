const BRACKETED_RULE = /\[([\p{L}\p{N} +'"’\p{Pd}]+)\]/gu

function normalizeRuleReference(value: string) {
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
