import { stratagemWindowsLabel } from '../core/reminders'
import { hash } from 'node:crypto'
import { currentMissionId } from '../core/legacyIds'
import { awardsOnce } from '../core/scoring'
import { hasTextTokens, textPointersIn, type TextLocations } from '../core/sourceText'
import type { CanonicalCatalogue, CanonicalDatasheet, CanonicalDetachment } from '../contracts/catalogue'
import { DISPOSITION_PACK_SECTION, type ReferenceDocument, type ReferenceSection } from '../contracts/reference'
import type { RuleEntry } from '../contracts/rules'
import { VS_DATA_ATTRIBUTION } from '../shared/vsData'
import { routeSlug } from '../core/slug'
import { byId, remember } from '../core/collections'
import type { MissionSelectionKind } from '../core/missionSelections'
import { compileCanonicalDetachments, completeStepsCooperatively } from './canonicalCatalogue'
import type { LoadedCatalogue } from '../shared/catalogueIndex'
import { dispositionMatchups, gameReferencesFor } from '../shared/gameReferences'
import { detachmentsOffering, type DispositionFaction } from '../shared/factionReferences'
import type { LoadedRules } from '../shared/rules'
import { COMBAT_PATROL_MATCHUP_ID, KOTC_MATCHUP_ID } from '../contracts/terrain'
import { referenceText } from './referenceText'
import { factionReferenceHref, type ReferenceFaction } from '../core/factionReferenceRoute'
import { completeSteps, type Steps } from '../shared/steps'
import { ruleSummaryBlocks, type RuleSummary } from '../contracts/rules'
import type { VsDataSummaries } from './vsDataSummaries'
import {
  awardSummary,
  datasheetSummaries,
  detachmentSummaries,
  type RuleSummaryFinder,
  ruleSummaryFinder,
  servedRuleSummary,
} from './referenceSummaries'

/** Text locations that can read the files some values name without holding the event loop. */
export type ScannableTextLocations = TextLocations & { scanFilesNamedIn: (values: readonly unknown[]) => Promise<void> }

export type ReferenceSources = {
  canonicalCatalogue: () => CanonicalCatalogue | null
  catalogue: () => LoadedCatalogue | null
  rules: () => LoadedRules | null
  /** Where each file a token names lives upstream; without it, withheld words say only that they are withheld. */
  textLocations?: TextLocations | ScannableTextLocations
  /** Each faction's route and detachments, which file detachments under their pages and say which offer a force disposition. */
  factions?: readonly (ReferenceFaction & DispositionFaction)[]
  /** The VS Data summaries the pages show, which stand in for the words they withhold. */
  summaries?: VsDataSummaries | null
}

/** A reference document by its id, or by the id it had when it named a mission, deployment or layout by its Game Datacards ID. */
export function referenceDocument(corpus: Pick<ReferenceCorpus, 'byId'>, id: string) {
  const at = id.lastIndexOf(':')
  return corpus.byId.get(id) ?? corpus.byId.get(`${id.slice(0, at + 1)}${currentMissionId(id.slice(at + 1))}`)
}

export type ReferenceCorpus = {
  catalogue: CanonicalCatalogue
  documents: ReferenceDocument[]
  byId: ReadonlyMap<string, ReferenceDocument>
  revision: string
  /** The summaries its sections show, which its records' data shows the same way. */
  summaries: RuleSummaryFinder
}

const NO_LOCATIONS: TextLocations = { files: {}, holds: () => false, recordsHolding: () => [] }
/** Where a corpus's withheld words live upstream, and the summaries that stand in for them. */
type CorpusFiles = { locations: TextLocations; summaries: RuleSummaryFinder }
type CachedCorpus = {
  catalogue: LoadedCatalogue | null
  rules: LoadedRules | null
  files: TextLocations
  factions: ReferenceSources['factions']
  summaries: ReferenceSources['summaries']
  corpus: ReferenceCorpus
}
const corpora = new WeakMap<CanonicalCatalogue, CachedCorpus>()

const isCurrent = (cached: CachedCorpus, sources: ReferenceSources, loaded: LoadedCatalogue | null, rules: LoadedRules | null) =>
  cached.catalogue === loaded &&
  cached.rules === rules &&
  cached.files === (sources.textLocations ?? NO_LOCATIONS) &&
  cached.factions === sources.factions &&
  cached.summaries === sources.summaries

export const referenceCorpusFor = (sources: ReferenceSources) => completeSteps(referenceCorpusSteps(sources))

const building = new WeakMap<CanonicalCatalogue, Promise<ReferenceCorpus | null>>()

/** Builds a corpus between other requests, sharing one build among concurrent reads of it. */
export async function referenceCorpusCooperatively(sources: ReferenceSources): Promise<ReferenceCorpus | null> {
  const canonical = sources.canonicalCatalogue()
  if (!canonical) return null
  const loaded = sources.catalogue()
  const rules = sources.rules()
  const cached = corpora.get(canonical)
  if (cached && isCurrent(cached, sources, loaded, rules)) return cached.corpus
  // Read once: a catalogue published mid-build would name files this build never scanned.
  const held = { ...sources, canonicalCatalogue: () => canonical, catalogue: () => loaded, rules: () => rules }
  return remember(building, canonical, async () => {
    try {
      if (held.textLocations && 'scanFilesNamedIn' in held.textLocations) await held.textLocations.scanFilesNamedIn([canonical, rules])
      return await completeStepsCooperatively(referenceCorpusSteps(held))
    } finally {
      building.delete(canonical)
    }
  })
}

function* referenceCorpusSteps(sources: ReferenceSources): Steps<ReferenceCorpus | null> {
  const canonical = sources.canonicalCatalogue()
  if (!canonical) return null
  const loaded = sources.catalogue()
  const rules = sources.rules()
  const files: CorpusFiles = { locations: sources.textLocations ?? NO_LOCATIONS, summaries: ruleSummaryFinder(sources.summaries ?? null) }
  const cached = corpora.get(canonical)
  if (cached && isCurrent(cached, sources, loaded, rules)) return cached.corpus
  const factionPaths = new Map<string, string>()
  for (const faction of sources.factions ?? []) {
    const path = factionReferenceHref(faction)
    factionPaths.set(faction.id, path)
    factionPaths.set(faction.slug, path)
  }
  const catalogue =
    canonical.detachments.length || !loaded || !rules
      ? canonical
      : { ...canonical, detachments: compileCanonicalDetachments(loaded, canonical.revisions, rules) }
  const unsorted: ReferenceDocument[] = []
  for (const sheet of catalogue.datasheets) {
    unsorted.push(datasheetDocument(files, sheet, factionPaths))
    yield
  }
  for (const detachment of catalogue.detachments) {
    unsorted.push(detachmentDocument(files, detachment, factionPaths))
    yield
  }
  if (rules) {
    const references = gameReferencesFor(rules)
    unsorted.push(...gameReferenceDocuments(files, references, rules, catalogue.revisions))
    for (const disposition of references.dispositions) {
      unsorted.push(dispositionDocument(files, references, disposition, sources.factions ?? [], catalogue.revisions))
      yield
    }
  }
  yield
  for (const document of catalogue.ruleDocuments) {
    unsorted.push(...ruleDocuments(files, document))
    yield
  }
  const documents = unsorted.toSorted(
    (left, right) => left.kind.localeCompare(right.kind) || left.title.localeCompare(right.title) || left.id.localeCompare(right.id),
  )
  const revision = hash('sha256', JSON.stringify({ catalogue, documents }))
  const ids = new Map(byId(documents))
  // A rule addressed before VS Data outlined the documents keeps answering to the id it had then.
  for (const document of catalogue.ruleDocuments)
    for (const entry of document.sections.flatMap((section) => section.entries))
      for (const former of entry.formerAnchors) {
        const found = ids.get(`rule:${document.slug}:${entry.anchor}`)
        if (found && !ids.has(`rule:${document.slug}:${former}`)) ids.set(`rule:${document.slug}:${former}`, found)
      }
  const corpus = { catalogue, documents, byId: ids as ReadonlyMap<string, ReferenceDocument>, revision, summaries: files.summaries }
  corpora.set(canonical, {
    catalogue: loaded,
    rules,
    files: sources.textLocations ?? NO_LOCATIONS,
    factions: sources.factions,
    summaries: sources.summaries,
    corpus,
  })
  return corpus
}

type GameReferences = ReturnType<typeof gameReferencesFor>
type GameReferencePack = GameReferences['packs'][number]

function gameReferenceDocuments(
  files: CorpusFiles,
  references: GameReferences,
  rules: LoadedRules,
  revisions: CanonicalCatalogue['revisions'],
): ReferenceDocument[] {
  return [
    ...references.packs.flatMap((pack) => missionDocuments(files, pack, references, revisions)),
    ...secondaryDocuments(files, references, revisions),
    ...deploymentDocuments(files, references, rules, revisions),
    ...terrainDocuments(files, references, rules, revisions),
  ]
}

function missionDocuments(
  files: CorpusFiles,
  pack: GameReferencePack,
  references: GameReferences,
  revisions: CanonicalCatalogue['revisions'],
): ReferenceDocument[] {
  const url = `/missions/${pack.id}`
  const metadata = {
    kind: 'mission' as const,
    faction: null,
    revisions: missionRevisions(revisions),
    attribution: [VS_DATA_ATTRIBUTION],
  }
  const matrix = section(
    files,
    url,
    'matrix',
    'Force disposition mission matrix',
    pack.missions.flatMap((mission) =>
      mission.matchups.map(([you, opponent]) => `${you?.name ?? 'Unknown'} vs ${opponent?.name ?? 'Unknown'}: ${mission.name}`),
    ),
  )
  const dispositions = section(
    files,
    url,
    'force-dispositions',
    'Force dispositions',
    references.dispositions.flatMap((disposition) => [disposition.name, disposition.text]),
  )
  const limits = section(files, url, 'mission-limits', 'Mission limits', [
    pack.fixedSecondaryCap === null ? null : `Each fixed secondary mission can score at most ${pack.fixedSecondaryCap} VP.`,
    ...pack.missions.flatMap((mission) => [
      mission.roundCap === null ? null : `${mission.name}: at most ${mission.roundCap} primary VP per battle round.`,
      mission.gameCap === null ? null : `${mission.name}: at most ${mission.gameCap} primary VP per game.`,
      mission.secondaryRoundCap === null ? null : `${mission.name}: at most ${mission.secondaryRoundCap} secondary VP per battle round.`,
      mission.secondaryGameCap === null ? null : `${mission.name}: at most ${mission.secondaryGameCap} secondary VP per game.`,
    ]),
  ])
  const twists = pack.twists.map((twist) =>
    section(
      files,
      url,
      `twist-${twist.id}`,
      twist.name,
      [`A mission twist${twist.changesPrimary ? ' that changes the primary missions' : ''}.`],
      twist.id,
      files.summaries.mission('mission-twist', twist.id),
    ),
  )
  return [
    {
      ...metadata,
      id: `mission-pack:${pack.id}`,
      title: pack.name,
      url,
      sections: present([matrix, dispositions, limits, ...twists]),
    },
    ...pack.missions.map((mission) => {
      const [you, opponent] = mission.matchups[0] ?? []
      const missionUrl = you && opponent ? `/missions/${pack.id}/matchups/${you.id}/${opponent.id}` : url
      return {
        ...metadata,
        id: `mission:${pack.id}:${mission.id}`,
        title: mission.name,
        url: `${missionUrl}#mission-${mission.id}`,
        sections: present([
          section(
            files,
            missionUrl,
            `mission-${mission.id}`,
            mission.name,
            missionReferenceLines(mission),
            mission.id,
            missionCardSummary(files.summaries, mission.card),
          ),
        ]),
      }
    }),
  ]
}

function secondaryDocuments(
  files: CorpusFiles,
  references: GameReferences,
  revisions: CanonicalCatalogue['revisions'],
): ReferenceDocument[] {
  const pack = references.packs[0]
  if (!pack) return []
  return references.secondaries.map((card) => {
    const url = `/missions/${pack.id}/secondaries/${card.slug}`
    return {
      id: `mission:secondary:${card.key}`,
      kind: 'mission',
      title: card.name,
      faction: null,
      url,
      revisions: missionRevisions(revisions),
      attribution: [VS_DATA_ATTRIBUTION],
      sections: present([
        section(
          files,
          url,
          `secondary-${card.key}`,
          card.name,
          missionCardLines(card),
          card.key,
          missionCardSummary(files.summaries, card),
        ),
      ]),
    }
  })
}

function deploymentDocuments(
  files: CorpusFiles,
  references: GameReferences,
  rules: LoadedRules,
  revisions: CanonicalCatalogue['revisions'],
): ReferenceDocument[] {
  return rules.deployments.map((deployment) => {
    const layout = rules.terrainLayouts.find((candidate) => candidate.deploymentId === deployment.id)
    const pageUrl = layout ? terrainUrl(references, layout.matchupId, layout.id).split('#')[0]! : '/missions'
    const url = `${pageUrl}#deployment-${deployment.id}`
    return {
      id: `deployment:${deployment.id}`,
      kind: 'deployment',
      title: deployment.name,
      faction: null,
      url,
      // Combat Patrol zones are measured from the pack's printed maps, not drawn by Battlemaster.
      ...battlefieldSources(revisions, layout?.matchupId, deployment.zones.length > 0 && layout?.matchupId !== COMBAT_PATROL_MATCHUP_ID),
      sections: present([
        section(
          files,
          pageUrl,
          `deployment-${deployment.id}`,
          deployment.name,
          [
            deployment.description,
            ...deployment.zones.map((zone) => `${zone.name} (${zone.player}): ${zone.points.length} boundary points.`),
            `${deployment.objectives.length} objective markers.`,
          ],
          deployment.id,
        ),
      ]),
    }
  })
}

function terrainDocuments(
  files: CorpusFiles,
  references: GameReferences,
  rules: LoadedRules,
  revisions: CanonicalCatalogue['revisions'],
): ReferenceDocument[] {
  const deployments = byId(rules.deployments)
  return rules.terrainLayouts.map((layout) => {
    const url = terrainUrl(references, layout.matchupId, layout.id)
    const matchup = matchupFor(references, layout.matchupId)
    return {
      id: `terrain:${layout.id}`,
      kind: 'terrain',
      title: layout.name,
      faction: null,
      url,
      ...battlefieldSources(revisions, layout.matchupId, Boolean(layout.geometry)),
      sections: present([
        section(files, url.split('#')[0]!, `terrain-${layout.id}`, layout.name, [
          layout.description,
          matchup ? `Matchup: ${matchup.you.name} vs ${matchup.opponent.name}` : null,
          layout.variant === null ? null : `Variant: ${layout.variant}`,
          layout.deploymentId ? `Deployment: ${deployments.get(layout.deploymentId)?.name ?? layout.deploymentId}` : null,
          ...layout.pieces.map(
            (piece) => `${piece.name}: ${piece.type} at ${piece.position.x}, ${piece.position.y}; rotation ${piece.rotation} degrees.`,
          ),
          layout.geometry ? `${layout.geometry.areas.length} exact terrain areas are available from the structured record.` : null,
        ]),
      ]),
    }
  })
}

function dispositionDocument(
  files: CorpusFiles,
  references: GameReferences,
  disposition: GameReferences['dispositions'][number],
  factions: readonly DispositionFaction[],
  revisions: CanonicalCatalogue['revisions'],
): ReferenceDocument {
  const url = `/force-dispositions/${disposition.id}`
  return {
    id: `disposition:${disposition.id}`,
    kind: 'disposition',
    title: disposition.name,
    faction: null,
    url,
    revisions: definedRevisions({ summaries: revisions.summaries, definitions: revisions.definitions }),
    attribution: [VS_DATA_ATTRIBUTION],
    sections: present([
      section(files, url, 'summary', 'Summary', [disposition.text], disposition.id),
      ...dispositionMatchups(references, disposition.id).map(({ pack, matchups }) =>
        section(
          files,
          url,
          `${DISPOSITION_PACK_SECTION}${pack.id}`,
          `Primary missions: ${pack.name}`,
          matchups.map(({ opponent, mission }) => `vs ${opponent.name}: ${mission.name}`),
        ),
      ),
      section(
        files,
        url,
        'detachments',
        'Detachments',
        detachmentsOffering(factions, disposition.id).flatMap((faction) =>
          faction.detachments.map(
            (detachment) => `${faction.displayName}: ${detachment.name}${detachment.points === null ? '' : ` (${detachment.points} DP)`}`,
          ),
        ),
      ),
    ]),
  }
}

function missionRevisions(revisions: CanonicalCatalogue['revisions']) {
  return definedRevisions({ summaries: revisions.summaries })
}

/**
 * A battlefield's sources: VS Data's, drawn with Battlemaster's geometry where it has any, except King of the
 * Colosseum arenas, which Praetorium traces from their publishers' diagrams in the datacards tree.
 */
function battlefieldSources(revisions: CanonicalCatalogue['revisions'], matchupId: string | undefined, drawnByBattlemaster: boolean) {
  if (matchupId === KOTC_MATCHUP_ID) {
    return {
      revisions: definedRevisions({ datacards: revisions.datacards }),
      attribution: ['Battlefield diagrams from Play On Tabletop and Frontline Gaming'],
    }
  }
  if (!drawnByBattlemaster) return { revisions: missionRevisions(revisions), attribution: [VS_DATA_ATTRIBUTION] }
  return {
    revisions: definedRevisions({ summaries: revisions.summaries, battlemaster: revisions.battlemaster }),
    attribution: [VS_DATA_ATTRIBUTION, 'Terrain geometry provided by Battlemaster'],
  }
}

/** The sources that pinned a revision, in the order given. */
function definedRevisions(revisions: Record<string, string | undefined>) {
  return Object.fromEntries(Object.entries(revisions).filter((entry): entry is [string, string] => Boolean(entry[1])))
}

function matchupFor(references: GameReferences, matchupId: string) {
  for (const you of references.dispositions) {
    for (const opponent of references.dispositions) {
      if (`${you.id}-vs-${opponent.id}` === matchupId) return { you, opponent }
    }
  }
  return null
}

function terrainUrl(references: GameReferences, matchupId: string, layoutId: string) {
  const matchup = matchupFor(references, matchupId)
  const pack = matchup
    ? references.packs.find((candidate) =>
        candidate.missions.some((mission) =>
          mission.matchups.some(([you, opponent]) => you?.id === matchup.you.id && opponent?.id === matchup.opponent.id),
        ),
      )
    : null
  return matchup && pack ? `/missions/${pack.id}/matchups/${matchup.you.id}/${matchup.opponent.id}#terrain-${layoutId}` : '/missions'
}

function missionReferenceLines(mission: GameReferencePack['missions'][number]): (string | null | undefined)[] {
  const card = mission.card
  return [
    ...mission.matchups.map(([you, opponent]) => `Matchup: ${you?.name ?? 'Unknown'} vs ${opponent?.name ?? 'Unknown'}`),
    mission.roundCap === null ? null : `Primary mission limit per battle round: ${mission.roundCap} VP`,
    mission.gameCap === null ? null : `Primary mission limit per game: ${mission.gameCap} VP`,
    mission.secondaryRoundCap === null ? null : `Secondary mission limit per battle round: ${mission.secondaryRoundCap} VP`,
    mission.secondaryGameCap === null ? null : `Secondary mission limit per game: ${mission.secondaryGameCap} VP`,
    ...missionCardLines(card),
  ]
}

/**
 * A mission card's summary with each award's and action's beneath it, as the card's page shows them: an award under
 * what it pays, an action under its name.
 */
function missionCardSummary(finder: RuleSummaryFinder, card: GameReferencePack['missions'][number]['card'] | null): Summaries | null {
  if (!card) return null
  const own = finder.mission('mission-card', card.key)
  const awards = awardsOnce(card.awards).map(({ award }) => ({
    name: `${award.vp} VP${award.per ? ` per ${award.per}` : ''}`,
    summary: awardSummary(finder, award),
    text: award.criteria,
  }))
  const actions = (card.actions ?? []).map((action) => ({
    name: `Action: ${action.name}`,
    summary: finder.mission('mission-action', action.id),
  }))
  const parts = summariesUnder([...awards, ...actions])
  if (!own) return parts
  if (!parts) return own
  const blocks = [...ruleSummaryBlocks(own), ...ruleSummaryBlocks(parts)]
  return { blocks, questions: [...own.questions, ...parts.questions], unsummarized: parts.unsummarized }
}

const selectionTracking: Record<MissionSelectionKind, string> = {
  punishment: 'punishment nominations with recorded table confirmations',
  guards: 'guards nominations with recorded table confirmations',
  'tempting-target': 'tempting-target nominations',
  beacon: 'manual Beacon nomination',
  'locate-and-deny': 'start-of-battle operation markers with recorded table confirmations and manual Sensor Sweep removals',
  'sensor-sweep': 'manual Sensor Sweep removals of opposing operation markers',
  consecrate: 'consecrated objectives with recorded table confirmations',
  decoy: 'decoyed objectives with recorded table confirmations',
  triangulate: 'triangulated objectives with recorded table confirmations',
  'extract-intel': 'Extract Intelligence operation markers with recorded table confirmations',
  'maintain-control': 'Maintain Control operation markers with recorded table confirmations',
  'booby-trap': 'trapped terrain areas with recorded table confirmations',
  surveil: 'manual removals of opposing operation markers',
}

function missionCardLines(
  card: GameReferencePack['missions'][number]['card'] | GameReferences['secondaries'][number] | null,
): (string | null | undefined)[] {
  return [
    card?.selection ? `Battle tracking: ${selectionTracking[card.selection]}.` : null,
    ...awardsOnce(card?.awards ?? []).flatMap(({ award, triggers }) => [
      award.criteria ? `Scoring: ${award.criteria}` : null,
      `Award: ${award.vp} VP${award.per ? ` per ${award.per}` : ''}${award.max === null ? '' : `, up to ${award.max} VP`}`,
      ...triggers.map(missionTiming),
      award.mode ? `Mode: ${award.mode}` : null,
      award.group ? `Exclusive group: ${award.group}` : null,
    ]),
    ...(card?.actions ?? []).map((action) => `Action: ${action.name}`),
    card?.whenDrawn ? `When drawn: ${card.whenDrawn.operation}.` : null,
    card?.whenDrawn?.roundMax === null || card?.whenDrawn?.roundMax === undefined
      ? null
      : `When-drawn rule applies through battle round ${card.whenDrawn.roundMax}.`,
    card?.whenDrawn?.heldCards.length ? `When-drawn related cards: ${card.whenDrawn.heldCards.join(', ')}.` : null,
  ]
}

function missionTiming(trigger: NonNullable<GameReferencePack['missions'][number]['card']>['awards'][number]['trigger']) {
  const fields = [
    trigger.timing,
    trigger.phase ? `${trigger.phase} phase` : null,
    trigger.playerTurn,
    trigger.roundMin === null ? null : `battle round ${trigger.roundMin} onwards`,
    trigger.roundMax === null ? null : `through battle round ${trigger.roundMax}`,
  ].filter(Boolean)
  return fields.length ? `Timing: ${fields.join('; ')}` : null
}

/** Said where a section's only words are rules text, which Praetorium publishes as names and numbers alone. */
export const TEXT_NOT_PUBLISHED = 'Rules text not published here; read it upstream at this section’s textSources.'

/**
 * A section, with Praetorium's own wording of the rule it names where VS Data summarizes it; else any withheld words
 * say where to read them upstream, located by `record`: the id the record holding them carries in its source file.
 */
const section = (
  files: CorpusFiles,
  baseUrl: string,
  id: string,
  title: string,
  lines: (string | null | undefined)[],
  record?: string,
  summary?: Summaries | null,
): ReferenceSection | null => {
  const text = lines
    .map((line) => (line ? referenceText(line) : ''))
    .filter(Boolean)
    .join('\n')
  const url = `${baseUrl}#${id}`
  // A rule whose words are withheld is still a rule an agent can find by name and be told where its words are.
  const textSources = textPointersIn(summary ? (summary.unsummarized ?? []) : lines, files.locations, record)
  const pointers = textSources.length ? { textSources } : {}
  if (summary) return { id, title, text, url, ruleSummary: servedRuleSummary(summary), ...pointers }
  const withheld = !text && lines.some((line) => line && hasTextTokens(line))
  if (!text && !withheld) return null
  return { id, title, text: text || TEXT_NOT_PUBLISHED, url, ...pointers }
}

/** Summaries a section shows, and the words of the rules it lists that have none, which it still points at. */
type Summaries = RuleSummary & { unsummarized?: (string | null | undefined)[] }

/** Several rules' summaries as one, each under its name, for a section that lists them. */
function summariesUnder(named: readonly { name: string; summary: RuleSummary | null; text?: string | null }[]): Summaries | null {
  const found = named.filter((entry): entry is { name: string; summary: RuleSummary } => Boolean(entry.summary))
  if (!found.length) return null
  return {
    blocks: found.flatMap(({ name, summary }) => [{ paragraph: [{ text: name, bold: true as const }] }, ...ruleSummaryBlocks(summary)]),
    questions: found.flatMap(({ summary }) => summary.questions),
    unsummarized: named.filter((entry) => !entry.summary).map((entry) => entry.text),
  }
}

const present = (sections: (ReferenceSection | null)[]) => sections.filter((entry): entry is ReferenceSection => Boolean(entry))
const attribution = (value: string | null) => (value ? [value] : [])

/** The page a datasheet is read on, which also keys its reference record. */
export const datasheetRoute = (sheet: CanonicalDatasheet) => sheet.referenceRoute ?? { catalogueId: sheet.catalogueId, slug: sheet.slug }

function datasheetDocument(files: CorpusFiles, sheet: CanonicalDatasheet, factionPaths: ReadonlyMap<string, string>): ReferenceDocument {
  const route = datasheetRoute(sheet)
  const url = `${factionPaths.get(route.catalogueId) ?? `/factions/${route.catalogueId}`}/datasheets/${route.slug}`
  const relationships = [...sheet.attachments, ...sheet.leaders, ...sheet.supporters].map((entry) => entry.name)
  const { entryId } = sheet.provenance.definitions
  const summaries = datasheetSummaries(files.summaries, sheet)
  return {
    id: `datasheet:${route.catalogueId}:${route.slug}`,
    kind: 'datasheet',
    title: sheet.name,
    faction: sheet.faction,
    url,
    revisions: revisionsForDatasheet(sheet),
    attribution: attribution(sheet.attribution),
    sections: present([
      section(
        files,
        url,
        'summary',
        'Summary',
        [
          sheet.faction,
          sheet.points === null ? null : `${sheet.points} points`,
          sheet.keywords.join(', '),
          ...sheet.composition,
          sheet.baseSize ? `Base size: ${sheet.baseSize}` : null,
          sheet.transport,
        ],
        entryId,
      ),
      ...sheet.profiles.map((profile) =>
        section(
          files,
          url,
          `profile-${profile.id}`,
          profile.name,
          profile.values.map(
            (value) => `${value.name}: ${value.value}${value.modifiers?.length ? ` (${value.modifiers.join('; ')})` : ''}`,
          ),
        ),
      ),
      ...sheet.abilities.map((ability, at) =>
        section(
          files,
          url,
          `ability-${ability.id}`,
          ability.name,
          [ability.source, ability.description ?? 'Description unavailable.'],
          ability.id,
          summaries.abilities[at],
        ),
      ),
      keywordRulesSection(files, url, sheet.keywordRules, summaries.keywordRules),
      section(files, url, 'loadout', 'Loadout', [sheet.loadout], entryId),
      section(
        files,
        url,
        'wargear',
        'Wargear',
        [...sheet.wargearOptions, ...(sheet.wargearGroups ?? []).flatMap((group) => [group.instruction, ...group.options])],
        entryId,
      ),
      section(
        files,
        url,
        'points',
        'Points',
        sheet.costs.map((cost) =>
          [cost.models, 'models', cost.cost, 'points', cost.keyword, cost.faction, cost.detachment, cost.copies].filter(Boolean).join(' '),
        ),
      ),
      section(files, url, 'relationships', 'Attachments', relationships),
    ]),
  }
}

function revisionsForDatasheet(sheet: CanonicalDatasheet) {
  return definedRevisions({
    definitions: sheet.provenance.definitions.revision,
    datacards: sheet.provenance.datacards?.revision,
    rules: sheet.provenance.rules?.revision,
  })
}

function detachmentDocument(
  files: CorpusFiles,
  detachment: CanonicalDetachment,
  factionPaths: ReadonlyMap<string, string>,
): ReferenceDocument {
  const url = `${factionPaths.get(detachment.factionSlug) ?? `/factions/${detachment.factionSlug}`}/detachments/${detachment.slug}`
  const summaries = detachmentSummaries(files.summaries, detachment)
  return {
    id: `detachment:${detachment.factionSlug}:${detachment.slug}`,
    kind: 'detachment',
    title: detachment.name,
    faction: detachment.faction,
    url,
    revisions: {
      definitions: detachment.provenance.definitions.revision,
      datacards: detachment.provenance.datacards.revision,
    },
    attribution: [detachment.attribution],
    sections: present([
      section(files, url, 'summary', 'Summary', [
        detachment.faction,
        detachment.points === null ? null : `${detachment.points} detachment points`,
        detachment.dispositions.join(', '),
      ]),
      ...detachment.rules.map((rule, index) =>
        section(
          files,
          url,
          `rule-${routeSlug(rule.name) || index + 1}`,
          rule.name,
          [rule.description ?? 'Description unavailable.'],
          detachment.id,
          summaries.rules[index],
        ),
      ),
      ...detachment.enhancements.map((enhancement, index) =>
        section(
          files,
          url,
          `enhancement-${routeSlug(enhancement.name) || index + 1}`,
          enhancement.name,
          [enhancement.points === null ? null : `${enhancement.points} points`, enhancement.description ?? 'Description unavailable.'],
          detachment.id,
          summaries.enhancements[index],
        ),
      ),
      ...detachment.upgrades.map((upgrade, index) =>
        section(
          files,
          url,
          `upgrade-${routeSlug(upgrade.name) || index + 1}`,
          upgrade.name,
          [upgrade.points === null ? null : `${upgrade.points} points`, upgrade.description ?? 'Description unavailable.'],
          detachment.id,
          summaries.upgrades[index],
        ),
      ),
      ...detachment.stratagems.map((stratagem, index) =>
        section(
          files,
          url,
          `stratagem-${routeSlug(stratagem.name) || index + 1}`,
          stratagem.name,
          [
            stratagem.cp === null ? null : `${stratagem.cp} CP`,
            stratagem.type,
            ...(stratagem.windows ? [stratagemWindowsLabel(stratagem.windows)] : [stratagem.phases.join(', '), stratagem.turn]),
            stratagem.description ?? 'Description unavailable.',
          ],
          stratagem.id,
          summaries.stratagems[index],
        ),
      ),
      keywordRulesSection(files, url, detachment.keywordRules, summaries.keywordRules),
    ]),
  }
}

function keywordRulesSection(
  files: CorpusFiles,
  url: string,
  rules: readonly { name: string; description: string }[],
  summaries: readonly (RuleSummary | null)[],
) {
  const summary = summariesUnder(rules.map((rule, at) => ({ name: rule.name, summary: summaries[at] ?? null, text: rule.description })))
  return section(
    files,
    url,
    'keyword-rules',
    'Keyword rules',
    rules.flatMap((rule) => [rule.name, rule.description]),
    undefined,
    summary,
  )
}

function ruleDocuments(files: CorpusFiles, document: CanonicalCatalogue['ruleDocuments'][number]): ReferenceDocument[] {
  return document.sections.flatMap((ruleSection) =>
    ruleSection.entries.map((entry) => ruleDocument(files, document, ruleSection.slug, ruleSection.title, entry)),
  )
}

function ruleDocument(
  files: CorpusFiles,
  document: CanonicalCatalogue['ruleDocuments'][number],
  sectionSlug: string,
  sectionTitle: string,
  entry: RuleEntry,
): ReferenceDocument {
  const baseUrl = `/rules/${document.slug}/${sectionSlug}`
  return {
    id: `rule:${document.slug}:${entry.anchor}`,
    kind: 'rule',
    title: entry.title,
    faction: null,
    url: `${baseUrl}#${entry.anchor}`,
    revisions: { summaries: document.provenance.summaries.revision },
    attribution: [VS_DATA_ATTRIBUTION],
    sections: present([
      section(
        files,
        baseUrl,
        entry.anchor,
        entry.title,
        [entry.code, entry.cost === null ? null : `${entry.cost} CP`],
        undefined,
        files.summaries.coreRule(entry.id),
      ),
      ...entry.clarifications.map((clarification) =>
        section(
          files,
          baseUrl,
          clarification.anchor,
          clarification.title,
          [clarification.code],
          undefined,
          files.summaries.coreRule(clarification.id),
        ),
      ),
      section(files, baseUrl, `context-${entry.anchor}`, 'Context', [document.title, sectionTitle]),
    ]),
  }
}

export function referenceDocumentMarkdown(document: ReferenceDocument): string {
  const context = [document.faction, document.kind].filter(Boolean).join(' · ')
  const sections = document.sections
    .map((entry) => {
      const upstream = (entry.textSources ?? []).map((pointer) => `- ${pointer.url}${pointer.id ? ` (id ${pointer.id})` : ''}`)
      const body = [
        entry.text,
        entry.ruleSummary ? `Summary in Praetorium’s own words:\n\n${entry.ruleSummary.text}` : null,
        upstream.length ? `Rules text upstream:\n${upstream.join('\n')}` : null,
      ]
      return `## ${entry.title}\n\n${body.filter(Boolean).join('\n\n')}`
    })
    .join('\n\n')
  const sources = document.attribution.length ? `\n\nSources: ${document.attribution.join('; ')}` : ''
  return `# ${document.title}\n\n${context}\n\n${sections}${sources}\n\nCanonical URL: ${document.url}\n`
}
