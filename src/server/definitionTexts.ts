import type { CatalogueFile } from '../core/catalogue'
import { datasheetProfileKind } from '../core/datasheetStructure'
import { resolvedText, textKey, textToken, textTokensIn } from '../core/sourceText'
import type { TextFacts } from '../core/textFacts'
import { paragraphsOf } from '../shared/datacards'
import type { DefinitionTexts, LoadedCatalogue } from '../shared/catalogueIndex'
import { rulesNamed } from '../shared/catalogueRules'
import { definitionFactsOf } from '../shared/textFacts'
import { publishedTexts } from './sourceTexts'

/** Profiles whose characteristics are numbers and keywords; every other profile's are its rules text. */
const STRUCTURE_PROFILES = new Set(['unit', 'ranged-weapon', 'melee-weapon'])
/** Modifiers that write a characteristic's text rather than count. */
const TEXT_MODIFIERS = new Set(['set', 'append', 'replace'])

type Node = Record<string, unknown>

/**
 * The definitions with every rules text — a rule's description, a rule-like profile's characteristics, and a
 * modifier that rewrites one — swapped for its token, and what the rules read from each.
 *
 * A string several files hold is published as the token of the first file read that holds it, as reference
 * pages always published it. A paragraph of a text has a token of its own, as a card that prints a table as
 * an image quotes the catalogue's paragraphs for it.
 */
export function definitionTexts(files: readonly { file: CatalogueFile; path: string }[]): DefinitionTexts {
  const tokens = new Map<string, string>()
  const words = new Map<string, string>()
  // A statline's string takes part in which file names a string first, as published tokens always chose, but has no words to keep.
  const register = (raw: string, token: string, rules: boolean) => {
    if (!tokens.has(raw)) tokens.set(raw, token)
    if (rules) words.set(textKey(textTokensIn(tokens.get(raw)!)[0]!), raw)
  }
  const textTypes = new Set<string>()
  for (const { file, path } of files) {
    const texts = publishedTexts(path)
    visitTexts(
      file,
      (raw, rules) => {
        register(raw, texts(raw, 'plain'), rules)
        for (const [at, paragraph] of paragraphsOf(raw).entries())
          if (paragraph !== raw) register(paragraph, texts(raw, `para${at}`), rules)
      },
      textTypes,
    )
  }
  for (const { file, path } of files) {
    const texts = publishedTexts(path)
    visitModifiers(file, textTypes, (raw) => register(raw, texts(raw, 'plain'), true))
  }
  const token = (raw: string) => tokens.get(raw) ?? null
  const tokenized = files.map(({ file, path }) => ({ file: withRulesTokens(file, textTypes, (raw) => tokens.get(raw) ?? raw), path }))
  const facts = new Map<string, TextFacts>()
  const factsOf = (key: string) => {
    let found = facts.get(key)
    const raw = words.get(key)
    if (!found && raw !== undefined) facts.set(key, (found = definitionFactsOf(raw)))
    return found
  }
  return {
    files: tokenized,
    token,
    words: (text) => resolvedText(text, (found) => words.get(textKey(found)) ?? null, textToken),
    facts: () => new Map([...words.keys()].map((key) => [key, factsOf(key)!])),
    fact: factsOf,
  }
}

/**
 * Calls `found` with every description and characteristic a file holds, in the order a reader meets them, and
 * whether it is rules text, collecting the rule-like characteristics' types.
 */
function visitTexts(value: unknown, found: (raw: string, rules: boolean) => void, textTypes: Set<string>, ruleProfile = false) {
  if (Array.isArray(value)) for (const entry of value) visitTexts(entry, found, textTypes, ruleProfile)
  else if (value && typeof value === 'object') {
    const node = value as Node
    const characteristics = typeof node.typeName === 'string' && Array.isArray(node.characteristics)
    const rules = characteristics && !STRUCTURE_PROFILES.has(datasheetProfileKind(node.typeName as string))
    for (const [key, entry] of Object.entries(node)) {
      if (typeof entry === 'string') {
        if (entry.trim() && (key === 'description' || key === '$text')) found(entry, key === 'description' || ruleProfile)
      } else visitTexts(entry, found, textTypes, ruleProfile || (rules && key === 'characteristics'))
    }
    if (ruleProfile && typeof node.typeId === 'string') textTypes.add(node.typeId)
  }
}

function visitModifiers(value: unknown, textTypes: ReadonlySet<string>, found: (raw: string) => void) {
  if (Array.isArray(value)) for (const entry of value) visitModifiers(entry, textTypes, found)
  else if (value && typeof value === 'object') {
    const node = value as Node
    if (rewritesText(node, textTypes)) found(node.value as string)
    for (const entry of Object.values(node)) if (entry && typeof entry === 'object') visitModifiers(entry, textTypes, found)
  }
}

const rewritesText = (node: Node, textTypes: ReadonlySet<string>) =>
  typeof node.type === 'string' &&
  TEXT_MODIFIERS.has(node.type) &&
  typeof node.field === 'string' &&
  textTypes.has(node.field) &&
  typeof node.value === 'string' &&
  node.value.trim() !== ''

/** A file with its rules texts swapped by `swap`, sharing every part that holds none. */
function withRulesTokens(file: CatalogueFile, textTypes: ReadonlySet<string>, swap: (raw: string) => string): CatalogueFile {
  const visit = (value: unknown, ruleProfile: boolean): unknown => {
    if (Array.isArray(value)) {
      let changed = false
      const next = value.map((entry) => {
        const visited = visit(entry, ruleProfile)
        changed ||= visited !== entry
        return visited
      })
      return changed ? next : value
    }
    if (!value || typeof value !== 'object') return value
    const node = value as Node
    const rules =
      typeof node.typeName === 'string' &&
      Array.isArray(node.characteristics) &&
      !STRUCTURE_PROFILES.has(datasheetProfileKind(node.typeName))
    let next: Node | undefined
    for (const [key, entry] of Object.entries(node)) {
      const visited =
        typeof entry === 'string'
          ? entry.trim() &&
            (key === 'description' || (key === '$text' && ruleProfile) || (key === 'value' && rewritesText(node, textTypes)))
            ? swap(entry)
            : entry
          : visit(entry, ruleProfile || (rules && key === 'characteristics'))
      if (visited !== entry) (next ??= { ...node })[key] = visited
    }
    return next ?? node
  }
  return visit(file, false) as CatalogueFile
}

/**
 * The definitions' facts as a device downloads them. A reference that names no rule the catalogue holds matches
 * nothing, and bold text can mark a whole sentence, so only references to known rules travel.
 */
export function downloadedDefinitionFacts(loaded: LoadedCatalogue) {
  return new Map(
    [...loaded.definitions!.facts()].map(([key, facts]) => {
      const { references, ...rest } = facts
      const known = references?.filter((name) => rulesNamed(loaded, [name]).length)
      return [key, known?.length ? { ...rest, references: known } : rest] as const
    }),
  )
}
