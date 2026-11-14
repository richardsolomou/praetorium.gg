import { compareText, joinKey, plainDashes, plainQuotes } from '../../src/core/text'
import { normalizedNameVariants } from '../../src/core/name'
import { routeSlug } from '../../src/core/slug'

/** Where each comparison reads from: the snapshot, Game Datacards at its pin and at upstream HEAD, and 40kdc-data at HEAD. */
export const SOURCES = ['ours', 'gdcPin', 'gdcHead', 'kdc'] as const
export type Source = (typeof SOURCES)[number]

export const KINDS = ['stats', 'weapons', 'size', 'keywords', 'attachments', 'detachments', 'enhancements', 'wargear-caps'] as const
export type Kind = (typeof KINDS)[number]

/**
 * - `likely`: Game Datacards and 40kdc agree with each other and not with us.
 * - `gdc`: Game Datacards disagrees with us; 40kdc agrees with us, is silent, or says something else.
 * - `low`: only 40kdc disagrees, and its data is a second opinion.
 */
export const CONFIDENCES = ['likely', 'gdc', 'low'] as const
export type Confidence = (typeof CONFIDENCES)[number]

/** A source's value; `undefined` where the source has no record to compare, `null` where its record lacks the value. */
export type Values = Partial<Record<Source, string | null>> & { ours: string | null }

export type Finding = {
  faction: string
  subject: string
  kind: Kind
  field: string
  values: Values
  confidence: Confidence
  /** The pinned card agrees with us and HEAD does not: Game Datacards changed since the pin. */
  newInGdcHead: boolean
}

export const PRESENT = 'present'
export const ABSENT = 'absent'

/** One characteristic as every source can print it: no inch marks, footnote stars or trailing plus, plain dashes, lower case. */
export function characteristic(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '-'
  const text = plainDashes(String(value))
    .replaceAll(/["“”″*]/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim()
    // A skill or save's plus goes; a dice expression's stays.
    .replaceAll(/(\d)\+(?!\d)/g, '$1')
    .toLowerCase()
  return text === '' || text === 'n/a' ? '-' : text
}

/** A weapon profile's name without the arrow a multi-profile weapon prints, or a "– Ranged"/"– Melee" mode the weapon's kind already says. */
export const weaponProfileName = (name: string) =>
  name
    .replace(/^[➤\s]+/, '')
    .replace(/\s*\p{Pd}\s*(ranged|melee)$/iu, '')
    .trim()

/** A weapon keyword as a slug, so "Anti-Fly 3+", "ANTI-FLY 3+" and 40kdc's `anti {Fly, 3}` read alike. */
export const weaponKeyword = (keyword: string) => routeSlug(plainDashes(plainQuotes(keyword)))

export type KdcKeyword = {
  keyword_id: string
  parameters?: { value?: number | string; target_keyword?: string; threshold?: number; excluded_target_keywords?: string[] }
}

export const keywordList = (keywords: readonly string[]) => [...new Set(keywords.map(weaponKeyword))].toSorted(compareText).join(', ')

/**
 * 40kdc's structured keywords as a card prints them: one Anti per threshold naming every
 * target ("Anti-Monster/Vehicle 3+"), and an exclusion as "(non-Monster/Vehicle)".
 */
export function kdcWeaponKeywords(keywords: readonly KdcKeyword[]) {
  const anti = new Map<string, string[]>()
  const printed: string[] = []
  for (const { keyword_id: id, parameters = {} } of keywords) {
    const excluded = parameters.excluded_target_keywords?.length ? ` non ${parameters.excluded_target_keywords.join(' ')}` : ''
    if (id === 'anti' && parameters.target_keyword && !excluded) {
      const key = String(parameters.threshold)
      anti.set(key, [...(anti.get(key) ?? []), parameters.target_keyword])
    } else printed.push([id, parameters.value ?? parameters.threshold].filter((part) => part !== undefined).join(' ') + excluded)
  }
  return keywordList([...printed, ...[...anti].map(([threshold, targets]) => `anti ${targets.join(' ')} ${threshold}`)])
}

/** Every key a name joins by, singular and plural alike, as the datacard join reads names. */
export const nameKeys = (name: string) => normalizedNameVariants(plainDashes(plainQuotes(name.normalize('NFKC')))).map(joinKey)

export function classify(values: Values): Confidence | null {
  const gdc = values.gdcHead !== undefined ? values.gdcHead : values.gdcPin
  const gdcDiffers = gdc !== undefined && gdc !== values.ours
  const kdcDiffers = values.kdc !== undefined && values.kdc !== values.ours
  if (gdcDiffers && kdcDiffers && gdc === values.kdc) return 'likely'
  if (gdcDiffers) return 'gdc'
  return kdcDiffers ? 'low' : null
}

export function finding(
  faction: string,
  subject: string,
  kind: Kind,
  field: string,
  values: Values,
  confidence = classify(values),
): Finding | null {
  if (!confidence) return null
  const newInGdcHead = values.gdcPin === values.ours && values.gdcHead !== undefined && values.gdcHead !== values.ours
  return { faction, subject, kind, field, values, confidence, newInGdcHead }
}

/**
 * Presence of each named thing on every side that has a record: a name on any side is
 * compared, matched across sides by `nameKeys`, and shown in our spelling where we have one.
 */
export function presence(names: Partial<Record<Source, readonly string[]>> & { ours: readonly string[] }) {
  const sides = SOURCES.filter((source) => names[source] !== undefined)
  const keysOf = new Map(sides.map((source) => [source, new Set(names[source]!.flatMap(nameKeys))]))
  const seen = new Set<string>()
  const shown: string[] = []
  for (const source of sides) {
    for (const name of names[source]!) {
      const keys = nameKeys(name)
      if (keys.some((key) => seen.has(key))) continue
      for (const key of keys) seen.add(key)
      shown.push(name)
    }
  }
  return shown.map((name) => {
    const keys = nameKeys(name)
    const values = Object.fromEntries(
      sides.map((source) => [source, keys.some((key) => keysOf.get(source)!.has(key)) ? PRESENT : ABSENT]),
    ) as Values
    return { name, values }
  })
}

const rank = (confidence: Confidence) => CONFIDENCES.indexOf(confidence)

export function sortFindings(findings: readonly Finding[]) {
  return findings.toSorted(
    (left, right) =>
      rank(left.confidence) - rank(right.confidence) ||
      compareText(left.faction, right.faction) ||
      compareText(left.subject, right.subject) ||
      KINDS.indexOf(left.kind) - KINDS.indexOf(right.kind) ||
      compareText(left.field, right.field),
  )
}

export function summarize(findings: readonly Finding[]) {
  const rows = new Map<string, Record<Kind | Confidence, number>>()
  const empty = () => Object.fromEntries([...KINDS, ...CONFIDENCES].map((key) => [key, 0])) as Record<Kind | Confidence, number>
  for (const found of findings) {
    const row = rows.get(found.faction) ?? empty()
    row[found.kind]++
    row[found.confidence]++
    rows.set(found.faction, row)
  }
  return [...rows].toSorted(([left], [right]) => compareText(left, right)).map(([faction, counts]) => ({ faction, ...counts }))
}

export type Unmatched = { faction: string; name: string; missingFrom: string }

export type DriftReport = {
  generatedAt: string
  revisions: { snapshot: string; gdcPin: string; gdcHead: string; kdcHead: string }
  findings: Finding[]
  summary: ReturnType<typeof summarize>
  unmatched: Unmatched[]
}

const cell = (text: string) => text.replaceAll('|', '\\|').replaceAll('\n', ' ')

function displayed(values: Values, source: Source) {
  const value = values[source]
  if (value === undefined) return '·'
  if (source !== 'ours' && value === values.ours) return '✓'
  return value === null ? '—' : `\`${cell(value)}\``
}

const LABELS: Record<Confidence, string> = {
  likely: 'likely edit',
  gdc: 'GDC differs',
  low: '40kdc only (low confidence)',
}

function table(findings: readonly Finding[], subject: boolean) {
  const head = [...(subject ? ['Faction', 'Subject'] : []), 'Kind', 'Field', 'Ours', 'GDC pin', 'GDC HEAD', '40kdc', 'Confidence']
  return [
    `| ${head.join(' | ')} |`,
    `| ${head.map(() => '---').join(' | ')} |`,
    ...findings.map(
      (found) =>
        `| ${[
          ...(subject ? [cell(found.faction), cell(found.subject)] : []),
          found.kind,
          cell(found.field),
          ...SOURCES.map((source) => displayed(found.values, source)),
          `${LABELS[found.confidence]}${found.newInGdcHead ? ', new in GDC HEAD' : ''}`,
        ].join(' | ')} |`,
    ),
  ].join('\n')
}

export function renderMarkdown(report: DriftReport) {
  const sorted = sortFindings(report.findings)
  const columns = [...KINDS, ...CONFIDENCES]
  const lines = [
    '# Catalogue drift',
    '',
    `Generated ${report.generatedAt} from snapshot \`${report.revisions.snapshot}\`, Game Datacards pin \`${report.revisions.gdcPin}\` and HEAD \`${report.revisions.gdcHead}\`, and 40kdc-data HEAD \`${report.revisions.kdcHead}\`.`,
    '',
    '`✓` agrees with ours, `·` the source has no matching record, `—` its record has no value. Game Datacards is the authority; 40kdc-data is a second opinion.',
    '',
    '## Summary',
    '',
    `| Faction | ${columns.join(' | ')} |`,
    `| --- | ${columns.map(() => '---:').join(' | ')} |`,
    ...report.summary.map((row) => `| ${cell(row.faction)} | ${columns.map((column) => row[column] || '').join(' | ')} |`),
    `| **Total** | ${columns.map((column) => report.summary.reduce((total, row) => total + row[column], 0)).join(' | ')} |`,
    '',
    '## Likely edits',
    '',
    'Game Datacards and 40kdc-data agree with each other and not with us.',
    '',
    table(
      sorted.filter((found) => found.confidence === 'likely'),
      true,
    ),
    '',
    '## New in Game Datacards HEAD',
    '',
    'The pinned card agrees with us; upstream has since changed it.',
    '',
    table(
      sorted.filter((found) => found.newInGdcHead),
      true,
    ),
    '',
    '## Unmatched',
    '',
    ...(report.unmatched.length
      ? report.unmatched.map((entry) => `- ${cell(entry.faction)}: ${cell(entry.name)} (no ${entry.missingFrom} record)`)
      : ['Every record joined.']),
    '',
    '## By faction',
  ]
  const groups = new Map<string, Map<string, Finding[]>>()
  for (const found of sorted.toSorted(
    (left, right) => compareText(left.faction, right.faction) || compareText(left.subject, right.subject),
  )) {
    const subjects = groups.get(found.faction) ?? new Map<string, Finding[]>()
    subjects.set(found.subject, [...(subjects.get(found.subject) ?? []), found])
    groups.set(found.faction, subjects)
  }
  for (const [faction, subjects] of groups) {
    lines.push('', `### ${faction}`)
    for (const [subject, found] of subjects) lines.push('', `#### ${subject}`, '', table(found, false))
  }
  return `${lines.join('\n')}\n`
}
