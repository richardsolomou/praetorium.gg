import type { CombatJudging, CombatReading, CombatRule, CombatText } from './combatRules'
import { normalizeCombatText, type RuleQuestion, ruleAnswers } from './combatRuleCompiler'

/**
 * What a rule decides in combat wherever a roster can place it, as VS Data's effect blocks state it
 * (`textFactsOfVsData`), so the server and a device read the same.
 *
 * A reading depends on the placement: its scope, whether it is a lone model's, whether its unit's keywords are known,
 * and what the rule asks of those keywords and of its name. Each placement keeps a tree of those questions with a
 * reading at every leaf, so answering them from a unit's own keywords finds its reading. A Stratagem's placement is
 * kept for each set of phases the simulator gives one.
 */
export type CombatFacts = {
  judging: CombatJudging
  readings: Record<string, ReadingNode[]>
  leaves: CombatReading[]
}
/** A placement's tree, its root first: a reading by its place in `leaves`, or a question and the nodes its answers lead to. */
type ReadingNode = number | [RuleQuestion, number, number]

/** Stands for the rule's source in a recorded label, which names the unit whose ability it is. */
const SOURCE = '\u0000source\u0000'

const placementKey = (rule: Pick<CombatRule, 'scope' | 'models' | 'keywords' | 'phases'>) =>
  `${rule.scope}:${rule.models === 1 ? 1 : 0}:${rule.keywords ? 1 : 0}${rule.phases?.length ? `:${rule.phases.join('+')}` : ''}`

/** Text as the compiler reads it, which is where a label's words come from, so it matches whatever printing it was read from. */
const comparable = (text: string) => normalizeCombatText(text).toLowerCase()

/** A choice's label with each part that repeats a clause of the rule's words replaced, for whoever gets no rules text. */
export function unquotedLabel(label: string, words: string) {
  const text = comparable(words)
  const quotes = (clause: string) => clause.split(' ').length >= 5 && text.includes(comparable(clause))
  return label
    .split(' · ')
    .map((part) => (part.split(/ or /i).some(quotes) ? 'Condition the rule states' : part))
    .join(' · ')
}

const NO_PART: CombatReading = { compiled: null, legacy: [], legacyDefault: 0, roles: [] }

/** How judging reads a text it holds only the facts of; facts of null say the words take no part. */
export function recordedCombatText(facts: CombatFacts | null): CombatText {
  if (!facts) return { judging: { target: null }, readingFor: () => NO_PART }
  return { judging: facts.judging, readingFor: (rule) => combatReadingFor(facts, rule) }
}

/** The reading recorded for a rule's placement, answered from its own keywords and name, or null where none was. */
export function combatReadingFor(facts: CombatFacts | null, rule: CombatRule): CombatReading | null {
  if (!facts) return NO_PART
  const nodes = facts.readings[placementKey(rule)]
  if (!nodes) return null
  const answer = ruleAnswers(rule)
  let node = nodes[0]!
  while (typeof node !== 'number') node = nodes[answer(node[0]) ? node[1] : node[2]]!
  return withSource(facts.leaves[node]!, rule.source)
}

function withSource(reading: CombatReading, source: string): CombatReading {
  const named = (choices: CombatReading['legacy']) =>
    choices.map((choice) => (choice.label.includes(SOURCE) ? { ...choice, label: choice.label.replaceAll(SOURCE, source) } : choice))
  return {
    ...reading,
    compiled: reading.compiled && { ...reading.compiled, choices: named(reading.compiled.choices) },
    ...(reading.shown !== undefined ? { shown: reading.shown && { ...reading.shown, choices: named(reading.shown.choices) } } : {}),
    legacy: named(reading.legacy),
  }
}
