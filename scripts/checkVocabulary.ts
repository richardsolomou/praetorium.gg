import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

/**
 * Groups were once clubs, their leagues seasons and their hidden-list games sealed games, and the old words crept back
 * whenever code was copied from nearby. They survive only where data or a deploy depends on them, as
 * docs/development/groups-and-tournaments.md lists. "League" is legal again, so its stored names need no listing.
 */
const EXEMPT = [
  // Generated from the module, so it repeats the names below.
  /^src\/spacetime\/generated\//,
  /^catalogue\//,
  /^CHANGELOG\.md$/,
  /^\.changeset\//,
  /^e2e\/durations\.json$/,
  /^docs\/development\/groups-and-tournaments\.md$/,
  /^src\/routes\/clubs\./,
  /^scripts\/checkVocabulary\.ts$/,
]

const STORED_NAMES = new Set([
  // Battle-log commands.
  'set-battle-club',
  'clubId',
  // Achievement ids.
  'club-night',
  'club-stalwart',
  'pillar-of-the-club',
  'club-battles',
])
/** The bare words stay legal only where they are data: a quoted id or key (the `clubs` realtime scope) and a legacy `/clubs` address. */
const STORED_FORMS = /(['"`])clubs?\1|(?<![\w-])clubs(?=: )|\/clubs\b/g
/** Words that only look like ours: catalogue names and the Season Ticket achievement. */
const LOOKALIKES = /trench club|listforge\.club|season[ -]ticket/gi
/** Preview seed tokens, which preview databases already hold. */
const PREVIEW_TOKEN = /^preview-club[\w-]*$/

const WORD = /[\w$:/-]*(?:club|season)[\w$:/-]*/gi
const SEALED_GAME = /sealed[\s_-]?games?/gi
// Paths and resource keys are checked a segment at a time, so `/clubs/…` reads as its stored part.
const segments = (word: string) =>
  word
    .split(/[/:$]+/)
    .map((part) => part.replace(/^-+|-+$/g, ''))
    .filter((part) => /club|season/i.test(part))

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
  .split('\n')
  .filter((file) => file && !EXEMPT.some((pattern) => pattern.test(file)) && !/\.(png|jpg|webp|ico|woff2?|wasm|zip)$/.test(file))

const problems = files.flatMap((file) => {
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return []
  }
  return text.split('\n').flatMap((line, at) => {
    const words = [
      ...(line.replace(LOOKALIKES, '').replace(STORED_FORMS, '').match(WORD) ?? [])
        .flatMap(segments)
        .filter((word) => !STORED_NAMES.has(word) && !PREVIEW_TOKEN.test(word)),
      ...(line.match(SEALED_GAME) ?? []),
    ]
    return words.length ? [`${file}:${at + 1}: ${[...new Set(words)].join(', ')}`] : []
  })
})

if (problems.length) {
  console.error('Say group, league, hidden-list game or tournament, as docs/development/groups-and-tournaments.md defines them:')
  for (const problem of problems) console.error(`  ${problem}`)
  process.exit(1)
}
