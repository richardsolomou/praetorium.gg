import {
  type CombatJudging,
  type CombatReading,
  type CombatRule,
  type CombatText,
  combatJudgingOf,
  combatRuleChoices,
  combatRuleDefault,
  combatRuleRoles,
} from './combatRules'
import { type AnsweredRule, compileCombatRule, type RuleQuestion, ruleAnswers } from './combatRuleCompiler'

/**
 * What a rule's words decide in combat wherever a roster can place it, recorded once from the words so a
 * device holding only the token reads the same.
 *
 * A reading depends on the placement as well as the words: its scope, whether it is a lone model's, whether
 * its unit's keywords are known, and what the words ask of those keywords and of the rule's name. Each
 * placement keeps a tree of those questions with a reading at every leaf, so answering them from a unit's own
 * keywords finds the reading its words would give. Phases are never recorded: only stratagems carry them,
 * and those are cards, not catalogue texts.
 */
export type CombatFacts = {
  judging: CombatJudging
  readings: Record<string, ReadingNode[]>
  leaves: CombatReading[]
}
/** A placement's tree, its root first: a reading by its place in `leaves`, or a question and the nodes its answers lead to. */
type ReadingNode = number | [RuleQuestion, number, number]

const SCOPES = ['unit', 'attached', 'nearby', 'stratagem', 'detachment'] as const satisfies readonly CombatRule['scope'][]
/** Stands for the rule's source in a recorded label, which names the unit whose ability it is. */
const SOURCE = '\u0000source\u0000'
/** More questions than any rule's words ask; a placement asking more records nothing and reads as unrecorded. */
const MOST_QUESTIONS = 8

const placementKey = (rule: Pick<CombatRule, 'scope' | 'models' | 'keywords'>) =>
  `${rule.scope}:${rule.models === 1 ? 1 : 0}:${rule.keywords ? 1 : 0}`

const comparable = (text: string) =>
  text
    .replaceAll(/\*\*|\^\^|<\/?[a-z]+>/gi, '')
    .replaceAll(/[‘’]/g, "'")
    .replaceAll(/[“”]/g, '"')
    .replaceAll(/\s+/g, ' ')
    .trim()
    .toLowerCase()

/** A choice's label with each part that repeats a clause of the rule's words replaced, for whoever gets no rules text. */
export function unquotedLabel(label: string, words: string) {
  const text = comparable(words)
  const quotes = (clause: string) => clause.split(' ').length >= 5 && text.includes(comparable(clause))
  return label
    .split(' · ')
    .map((part) => (part.split(/ or /i).some(quotes) ? 'Condition the rule states' : part))
    .join(' · ')
}

/** The reading a rule's words give one placement, read from the words. */
export function combatReadingOf(rule: AnsweredRule): CombatReading {
  const plain: CombatRule = { ...rule, included: false, appliedDefences: undefined, reading: undefined }
  const compiled = compileCombatRule(plain)
  return {
    compiled,
    legacy: compiled ? [] : combatRuleChoices(plain),
    legacyDefault: compiled ? 0 : combatRuleDefault(plain),
    roles: combatRuleRoles(rule.description),
  }
}

/** A text's combat facts, or null for words that take no part in combat wherever they are placed. */
export function combatFactsOf(words: string): CombatFacts | null {
  const judging = combatJudgingOf(words)
  const leaves: CombatReading[] = []
  const leafAt = new Map<string, number>()
  const leaf = (reading: CombatReading) => {
    const key = JSON.stringify(reading)
    let at = leafAt.get(key)
    if (at === undefined) {
      at = leaves.push(reading) - 1
      leafAt.set(key, at)
    }
    return at
  }
  const readings: Record<string, ReadingNode[]> = {}
  for (const scope of SCOPES)
    for (const models of [1, undefined])
      for (const known of [true, false]) {
        const tree = recordedTree((answers) =>
          unquotedReading(
            combatReadingOf({
              id: '',
              name: '',
              source: SOURCE,
              description: words,
              scope,
              models,
              ...(known ? { keywords: [] } : {}),
              answers,
            }),
            words,
          ),
        )
        if (tree) readings[placementKey({ scope, models, keywords: known ? [] : undefined })] = flattened(tree, leaf)
      }
  if (!judging.orders && !leaves.some(takesPart)) return null
  return { judging, readings, leaves }
}

/**
 * The reading every answer to the questions a read asks would give, as a tree: each question splits it,
 * in the order the read asks them. Null where the words ask more than any rule should.
 */
function recordedTree(read: (answers: (question: RuleQuestion) => boolean) => CombatReading) {
  const explore = (given: ReadonlyMap<RuleQuestion, boolean>): Explored | null => {
    let open: RuleQuestion | undefined
    const reading = read((question) => {
      const answer = given.get(question)
      if (answer !== undefined) return answer
      open ??= question
      return false
    })
    if (open === undefined) return reading
    if (given.size >= MOST_QUESTIONS) return null
    const yes = explore(new Map([...given, [open, true]]))
    const no = explore(new Map([...given, [open, false]]))
    return yes && no ? [open, yes, no] : null
  }
  return explore(new Map())
}

type Explored = [RuleQuestion, Explored, Explored] | CombatReading

function flattened(tree: Explored, leaf: (reading: CombatReading) => number): ReadingNode[] {
  const nodes: ReadingNode[] = []
  const add = (node: Explored): number => {
    const at = nodes.push(0) - 1
    nodes[at] = Array.isArray(node) ? [node[0], add(node[1]), add(node[2])] : leaf(node)
    return at
  }
  add(tree)
  return nodes
}

/** A reading whose labels quote none of the words it was read from, as it travels without them. */
function unquotedReading(reading: CombatReading, words: string): CombatReading {
  const unquoted = (choices: CombatReading['legacy']) => choices.map((choice) => ({ ...choice, label: unquotedLabel(choice.label, words) }))
  return {
    ...reading,
    compiled: reading.compiled && { ...reading.compiled, choices: unquoted(reading.compiled.choices) },
    legacy: unquoted(reading.legacy),
  }
}

const takesPart = (reading: CombatReading) =>
  reading.compiled ? reading.compiled.choices.some((choice) => choice.effects.length) : reading.roles.length > 0

const NO_PART: CombatReading = { compiled: null, legacy: [], legacyDefault: 0, roles: [] }

/** How judging reads a text it holds only the facts of; facts of null say the words take no part. */
export function recordedCombatText(facts: CombatFacts | null): CombatText {
  if (!facts) return { judging: { target: null }, readingFor: () => NO_PART }
  return { judging: facts.judging, readingFor: (rule) => combatReadingFor(facts, rule) }
}

/** The reading recorded for a rule's placement, answered from its own keywords and name, or null where none was. */
export function combatReadingFor(facts: CombatFacts | null, rule: CombatRule): CombatReading | null {
  if (!facts) return NO_PART
  if (rule.phases?.length) return null
  const nodes = facts.readings[placementKey(rule)]
  if (!nodes) return null
  const answer = ruleAnswers(rule)
  let node = nodes[0]!
  while (typeof node !== 'number') node = nodes[answer(node[0]) ? node[1] : node[2]]!
  return withSource(facts.leaves[node]!, rule.source)
}

/**
 * Whether these words give a rule's placement the reading recorded for it, as the words it was recorded from always
 * do; another source's printing of the same rule may read otherwise. Readings that take no part agree.
 */
export function readsAsRecorded(rule: CombatRule, words: string) {
  const reading = withSource(
    unquotedReading(
      combatReadingOf({
        id: '',
        name: '',
        source: SOURCE,
        description: words,
        scope: rule.scope,
        models: rule.models === 1 ? 1 : undefined,
        ...(rule.keywords ? { keywords: [] } : {}),
        answers: ruleAnswers(rule),
      }),
      words,
    ),
    rule.source,
  )
  return JSON.stringify(reading) === JSON.stringify(rule.reading) || (!takesPart(reading) && (!rule.reading || !takesPart(rule.reading)))
}

function withSource(reading: CombatReading, source: string): CombatReading {
  const named = (choices: CombatReading['legacy']) =>
    choices.map((choice) => (choice.label.includes(SOURCE) ? { ...choice, label: choice.label.replaceAll(SOURCE, source) } : choice))
  return {
    ...reading,
    compiled: reading.compiled && { ...reading.compiled, choices: named(reading.compiled.choices) },
    legacy: named(reading.legacy),
  }
}
