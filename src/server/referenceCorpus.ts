import { hash } from 'node:crypto'
import { hasTextTokens, textPointersIn, type TextLocations } from '../shared/sourceText'
import type { CanonicalCatalogue, CanonicalDatasheet, CanonicalDetachment } from '../contracts/catalogue'
import type { ReferenceDocument, ReferenceSection } from '../contracts/reference'
import type { RuleDocument, RuleEntry } from '../contracts/rules'
import { routeSlug } from '../core/slug'
import type { MissionSelectionKind } from '../core/missionSelections'
import { compileCanonicalDetachments } from './canonicalCatalogue'
import type { LoadedCatalogue } from './catalogueIndex'
import { DATACARDS_ATTRIBUTION } from './datacards'
import { gameReferencesFor } from '../shared/gameReferences'
import { RULES_DATA_ATTRIBUTION, type LoadedRules } from './rules'
import { referenceText } from './referenceText'
import { factionReferenceHref, type ReferenceFaction } from '../core/factionReferenceRoute'

export type ReferenceSources = {
  canonicalCatalogue: () => CanonicalCatalogue | null
  catalogue: () => LoadedCatalogue | null
  rules: () => LoadedRules | null
  /** Where each file a token names lives upstream; without it, withheld words say only that they are withheld. */
  textLocations?: TextLocations
  factions?: readonly (ReferenceFaction & { slug: string })[]
}

export type ReferenceCorpus = {
  catalogue: CanonicalCatalogue
  documents: ReferenceDocument[]
  byId: ReadonlyMap<string, ReferenceDocument>
  revision: string
}

const NO_LOCATIONS: TextLocations = { files: {}, holds: () => false, recordsHolding: () => [] }
type CachedCorpus = {
  catalogue: LoadedCatalogue | null
  rules: LoadedRules | null
  files: TextLocations
  factions: ReferenceSources['factions']
  corpus: ReferenceCorpus
}
const corpora = new WeakMap<CanonicalCatalogue, CachedCorpus>()

export function referenceCorpusFor(sources: ReferenceSources): ReferenceCorpus | null {
  const canonical = sources.canonicalCatalogue()
  if (!canonical) return null
  const loaded = sources.catalogue()
  const rules = sources.rules()
  const files = sources.textLocations ?? NO_LOCATIONS
  const cached = corpora.get(canonical)
  if (cached?.catalogue === loaded && cached.rules === rules && cached.files === files && cached.factions === sources.factions)
    return cached.corpus
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
  const documents = [
    ...catalogue.datasheets.map((sheet) => datasheetDocument(files, sheet, factionPaths)),
    ...catalogue.detachments.map((detachment) => detachmentDocument(files, detachment, factionPaths)),
    ...(rules ? gameReferenceDocuments(files, gameReferencesFor(rules), rules, catalogue.revisions) : []),
    ...catalogue.ruleDocuments.flatMap((document) => ruleDocuments(files, document)),
  ].toSorted(
    (left, right) => left.kind.localeCompare(right.kind) || left.title.localeCompare(right.title) || left.id.localeCompare(right.id),
  )
  const revision = hash('sha256', JSON.stringify({ catalogue, documents }))
  const corpus = { catalogue, documents, byId: new Map(documents.map((document) => [document.id, document])), revision }
  corpora.set(canonical, { catalogue: loaded, rules, files, factions: sources.factions, corpus })
  return corpus
}

type GameReferences = ReturnType<typeof gameReferencesFor>
type GameReferencePack = GameReferences['packs'][number]

function gameReferenceDocuments(
  files: TextLocations,
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
  files: TextLocations,
  pack: GameReferencePack,
  references: GameReferences,
  revisions: CanonicalCatalogue['revisions'],
): ReferenceDocument[] {
  const url = `/missions/${pack.id}`
  const metadata = {
    kind: 'mission' as const,
    faction: null,
    revisions: missionRevisions(revisions),
    attribution: [RULES_DATA_ATTRIBUTION, DATACARDS_ATTRIBUTION],
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
    section(files, url, `twist-${twist.id}`, twist.name, [twist.lore, twist.rules ?? 'Rules unavailable.'], twist.id),
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
        sections: present([section(files, missionUrl, `mission-${mission.id}`, mission.name, missionReferenceLines(mission), mission.id)]),
      }
    }),
  ]
}

function secondaryDocuments(
  files: TextLocations,
  references: GameReferences,
  revisions: CanonicalCatalogue['revisions'],
): ReferenceDocument[] {
  const pack = references.packs[0]
  if (!pack) return []
  return references.secondaries.map((card) => {
    const url = `/missions/${pack.id}/secondaries/${card.key}`
    return {
      id: `mission:secondary:${card.key}`,
      kind: 'mission',
      title: card.name,
      faction: null,
      url,
      revisions: missionRevisions(revisions),
      attribution: [RULES_DATA_ATTRIBUTION, DATACARDS_ATTRIBUTION],
      sections: present([section(files, url, `secondary-${card.key}`, card.name, missionCardLines(card), card.key)]),
    }
  })
}

function deploymentDocuments(
  files: TextLocations,
  references: GameReferences,
  rules: LoadedRules,
  revisions: CanonicalCatalogue['revisions'],
): ReferenceDocument[] {
  return (rules.deployments ?? []).map((deployment) => {
    const layout = (rules.terrainLayouts ?? []).find((candidate) => candidate.deploymentId === deployment.id)
    const pageUrl = layout ? terrainUrl(references, layout.matchupId, layout.id).split('#')[0]! : '/missions'
    const url = `${pageUrl}#deployment-${deployment.id}`
    return {
      id: `deployment:${deployment.id}`,
      kind: 'deployment',
      title: deployment.name,
      faction: null,
      url,
      revisions: missionRevisions(revisions),
      attribution: [RULES_DATA_ATTRIBUTION],
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
  files: TextLocations,
  references: GameReferences,
  rules: LoadedRules,
  revisions: CanonicalCatalogue['revisions'],
): ReferenceDocument[] {
  const deployments = new Map((rules.deployments ?? []).map((deployment) => [deployment.id, deployment]))
  return (rules.terrainLayouts ?? []).map((layout) => {
    const url = terrainUrl(references, layout.matchupId, layout.id)
    const matchup = matchupFor(references, layout.matchupId)
    return {
      id: `terrain:${layout.id}`,
      kind: 'terrain',
      title: layout.name,
      faction: null,
      url,
      revisions: definedRevisions({ rules: revisions.rules, datacards: revisions.datacards, battlemaster: revisions.battlemaster }),
      attribution: [RULES_DATA_ATTRIBUTION, ...(layout.geometry ? ['Terrain geometry provided by Battlemaster'] : [])],
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

function missionRevisions(revisions: CanonicalCatalogue['revisions']) {
  return definedRevisions({ rules: revisions.rules, datacards: revisions.datacards })
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

const selectionTracking: Record<MissionSelectionKind, string> = {
  punishment: 'punishment nominations with recorded table confirmations',
  guards: 'guards nominations with recorded table confirmations',
  'tempting-target': 'tempting-target nominations with recorded table confirmations',
  beacon: 'manual Beacon nomination',
  'locate-and-deny': 'start-of-battle operation markers with recorded table confirmations and manual Sensor Sweep removals',
  'sensor-sweep': 'manual Sensor Sweep removals of opposing operation markers',
  consecrate: 'consecrated objectives with recorded table confirmations',
}

function missionCardLines(
  card: GameReferencePack['missions'][number]['card'] | GameReferences['secondaries'][number] | null,
): (string | null | undefined)[] {
  return [
    card?.text,
    card?.selection ? `Battle tracking: ${selectionTracking[card.selection]}.` : null,
    ...(card?.awards ?? []).flatMap((award) => [
      `Scoring: ${award.criteria ?? 'Criteria unavailable.'}`,
      `Award: ${award.vp} VP${award.per ? ` per ${award.per}` : ''}${award.max === null ? '' : `, up to ${award.max} VP`}${award.cumulative ? ', cumulative' : ''}`,
      missionTiming(award.trigger),
      award.mode ? `Mode: ${award.mode}` : null,
      award.group ? `Exclusive group: ${award.group}` : null,
    ]),
    ...(card?.actions ?? []).flatMap((action) => [
      `Action: ${action.name}`,
      action.starts ? `Starts: ${action.starts}` : null,
      action.completes ? `Completes: ${action.completes}` : null,
      action.effect ? `Effect: ${action.effect}` : null,
      action.units ? `Units: ${action.units}` : null,
      action.useLimit ? `Use limit: ${action.useLimit}` : null,
      action.restriction ? `Restriction: ${action.restriction}` : null,
    ]),
    card?.whenDrawn ? `When drawn: ${card.whenDrawn.operation}.` : null,
    card?.whenDrawn?.roundMax === null || card?.whenDrawn?.roundMax === undefined
      ? null
      : `When-drawn rule applies through battle round ${card.whenDrawn.roundMax}.`,
    card?.whenDrawn?.heldCards.length ? `When-drawn related cards: ${card.whenDrawn.heldCards.join(', ')}.` : null,
    card?.whenDrawn?.condition,
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
 * A section, where any withheld words say where to read them upstream, located by `record`:
 * the id the record holding them carries in its source file.
 */
const section = (
  files: TextLocations,
  baseUrl: string,
  id: string,
  title: string,
  lines: (string | null | undefined)[],
  record?: string,
): ReferenceSection | null => {
  const text = lines
    .map((line) => (line ? referenceText(line) : ''))
    .filter(Boolean)
    .join('\n')
  // A rule whose words are withheld is still a rule an agent can find by name and be told where its words are.
  const textSources = textPointersIn(lines, files, record)
  const withheld = !text && lines.some((line) => line && hasTextTokens(line))
  if (!text && !withheld) return null
  return { id, title, text: text || TEXT_NOT_PUBLISHED, url: `${baseUrl}#${id}`, ...(textSources.length ? { textSources } : {}) }
}

const present = (sections: (ReferenceSection | null)[]) => sections.filter((entry): entry is ReferenceSection => Boolean(entry))
const attribution = (value: string | null) => (value ? [value] : [])

/** The page a datasheet is read on, which also keys its reference record. */
export const datasheetRoute = (sheet: CanonicalDatasheet) => sheet.referenceRoute ?? { catalogueId: sheet.catalogueId, slug: sheet.slug }

function datasheetDocument(files: TextLocations, sheet: CanonicalDatasheet, factionPaths: ReadonlyMap<string, string>): ReferenceDocument {
  const route = datasheetRoute(sheet)
  const url = `${factionPaths.get(route.catalogueId) ?? `/factions/${route.catalogueId}`}/datasheets/${route.slug}`
  const relationships = [...sheet.attachments, ...sheet.leaders, ...sheet.supporters].map((entry) => entry.name)
  const { entryId } = sheet.provenance.definitions
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
      ...sheet.abilities.map((ability) =>
        section(
          files,
          url,
          `ability-${ability.id}`,
          ability.name,
          [ability.source, ability.description ?? 'Description unavailable.'],
          ability.id,
        ),
      ),
      section(
        files,
        url,
        'keyword-rules',
        'Keyword rules',
        sheet.keywordRules.flatMap((rule) => [rule.name, rule.description]),
      ),
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
  files: TextLocations,
  detachment: CanonicalDetachment,
  factionPaths: ReadonlyMap<string, string>,
): ReferenceDocument {
  const url = `${factionPaths.get(detachment.factionSlug) ?? `/factions/${detachment.factionSlug}`}/detachments/${detachment.slug}`
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
        ),
      ),
      ...detachment.stratagems.map((stratagem, index) =>
        section(
          files,
          url,
          `stratagem-${routeSlug(stratagem.name) || index + 1}`,
          stratagem.name,
          [
            `${stratagem.cp} CP`,
            stratagem.type,
            stratagem.phases.join(', '),
            stratagem.turn,
            stratagem.description ?? 'Description unavailable.',
          ],
          stratagem.id,
        ),
      ),
      section(
        files,
        url,
        'keyword-rules',
        'Keyword rules',
        detachment.keywordRules.flatMap((rule) => [rule.name, rule.description]),
      ),
    ]),
  }
}

function ruleDocuments(
  files: TextLocations,
  document: RuleDocument & { provenance: { datacards: { revision: string } } },
): ReferenceDocument[] {
  return document.sections.flatMap((ruleSection) =>
    ruleSection.entries.map((entry) => ruleDocument(files, document, ruleSection.slug, ruleSection.title, entry)),
  )
}

function ruleDocument(
  files: TextLocations,
  document: RuleDocument & { provenance: { datacards: { revision: string } } },
  sectionSlug: string,
  sectionTitle: string,
  entry: RuleEntry,
): ReferenceDocument {
  const baseUrl = `/rules/${document.slug}/${sectionSlug}`
  const url = `${baseUrl}#${entry.anchor}`
  const main = section(
    files,
    baseUrl,
    entry.anchor,
    entry.title,
    [
      entry.code,
      entry.cost === null ? null : `${entry.cost} CP`,
      entry.lore,
      ...entry.facts.map((fact) => `${fact.label}: ${fact.markup}`),
      ...entry.blocks.flatMap((block) => (block.kind === 'clarification' ? [] : [block.kind === 'heading' ? block.text : block.markup])),
    ],
    entry.id,
  )
  const clarifications = entry.blocks.flatMap((block) =>
    block.kind === 'clarification'
      ? [section(files, baseUrl, block.anchor ?? entry.anchor, block.title, [block.code, block.markup], entry.id)]
      : [],
  )
  return {
    id: `rule:${document.slug}:${entry.anchor}`,
    kind: 'rule',
    title: entry.title,
    faction: null,
    url,
    revisions: { datacards: document.provenance.datacards.revision },
    attribution: [DATACARDS_ATTRIBUTION],
    sections: present([
      main,
      ...clarifications,
      section(files, baseUrl, `context-${entry.anchor}`, 'Context', [document.title, sectionTitle]),
    ]),
  }
}

export function referenceDocumentMarkdown(document: ReferenceDocument): string {
  const context = [document.faction, document.kind].filter(Boolean).join(' · ')
  const sections = document.sections
    .map((entry) => {
      const upstream = (entry.textSources ?? []).map((pointer) => `- ${pointer.url}${pointer.id ? ` (id ${pointer.id})` : ''}`)
      return `## ${entry.title}\n\n${entry.text}${upstream.length ? `\n\nRules text upstream:\n${upstream.join('\n')}` : ''}`
    })
    .join('\n\n')
  const sources = document.attribution.length ? `\n\nSources: ${document.attribution.join('; ')}` : ''
  return `# ${document.title}\n\n${context}\n\n${sections}${sources}\n\nCanonical URL: ${document.url}\n`
}
