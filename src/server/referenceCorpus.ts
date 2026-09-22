import { createHash } from 'node:crypto'
import type { CanonicalCatalogue, CanonicalDatasheet, CanonicalDetachment } from '../contracts/catalogue'
import type { ReferenceDocument, ReferenceSection } from '../contracts/reference'
import type { RuleDocument, RuleEntry } from '../contracts/rules'
import { routeSlug } from '../core/slug'
import { compileCanonicalDetachments } from './canonicalCatalogue'
import type { LoadedCatalogue } from './catalogueIndex'
import { DATACARDS_ATTRIBUTION } from './datacards'
import { gameReferencesFor } from './gameReferences'
import { RULES_DATA_ATTRIBUTION, type LoadedRules } from './rules'
import { referenceText } from './referenceText'

export type ReferenceSources = {
  canonicalCatalogue: () => CanonicalCatalogue | null
  catalogue: () => LoadedCatalogue | null
  rules: () => LoadedRules | null
}

export type ReferenceCorpus = {
  catalogue: CanonicalCatalogue
  documents: ReferenceDocument[]
  byId: ReadonlyMap<string, ReferenceDocument>
  revision: string
}

type CachedCorpus = { catalogue: LoadedCatalogue | null; rules: LoadedRules | null; corpus: ReferenceCorpus }
const corpora = new WeakMap<CanonicalCatalogue, CachedCorpus>()

export function referenceCorpusFor(sources: ReferenceSources): ReferenceCorpus | null {
  const canonical = sources.canonicalCatalogue()
  if (!canonical) return null
  const loaded = sources.catalogue()
  const rules = sources.rules()
  const cached = corpora.get(canonical)
  if (cached?.catalogue === loaded && cached.rules === rules) return cached.corpus
  const catalogue =
    canonical.detachments.length || !loaded || !rules
      ? canonical
      : { ...canonical, detachments: compileCanonicalDetachments(loaded, canonical.revisions, rules) }
  const documents = [
    ...catalogue.datasheets.map(datasheetDocument),
    ...catalogue.detachments.map(detachmentDocument),
    ...(rules ? gameReferencesFor(rules).packs.flatMap((pack) => missionDocuments(pack, catalogue.revisions)) : []),
    ...catalogue.ruleDocuments.flatMap(ruleDocuments),
  ].toSorted(
    (left, right) => left.kind.localeCompare(right.kind) || left.title.localeCompare(right.title) || left.id.localeCompare(right.id),
  )
  const revision = createHash('sha256').update(JSON.stringify({ catalogue, documents })).digest('hex')
  const corpus = { catalogue, documents, byId: new Map(documents.map((document) => [document.id, document])), revision }
  corpora.set(canonical, { catalogue: loaded, rules, corpus })
  return corpus
}

type GameReferencePack = ReturnType<typeof gameReferencesFor>['packs'][number]

function missionDocuments(pack: GameReferencePack, revisions: CanonicalCatalogue['revisions']): ReferenceDocument[] {
  const url = `/mission-packs/${pack.id}`
  const metadata = {
    kind: 'mission' as const,
    faction: null,
    revisions: Object.fromEntries(
      [
        ['rules', revisions.rules],
        ['datacards', revisions.datacards],
      ].filter((entry): entry is [string, string] => Boolean(entry[1])),
    ),
    attribution: [RULES_DATA_ATTRIBUTION, DATACARDS_ATTRIBUTION],
  }
  const matrix = section(
    url,
    'matrix',
    'Force disposition mission matrix',
    pack.missions.flatMap((mission) =>
      mission.matchups.map(([you, opponent]) => `${you?.name ?? 'Unknown'} vs ${opponent?.name ?? 'Unknown'}: ${mission.name}`),
    ),
  )
  return [
    {
      ...metadata,
      id: `mission-pack:${pack.id}`,
      title: pack.name,
      url,
      sections: matrix ? [matrix] : [],
    },
    ...pack.missions.map((mission) => {
      const [you, opponent] = mission.matchups[0] ?? []
      const missionUrl = you && opponent ? `/mission-matchups/${pack.id}/${you.id}/${opponent.id}` : url
      return {
        ...metadata,
        id: `mission:${pack.id}:${mission.id}`,
        title: mission.name,
        url: `${missionUrl}#mission-${mission.id}`,
        sections: present([section(missionUrl, `mission-${mission.id}`, mission.name, missionReferenceLines(mission))]),
      }
    }),
  ]
}

function missionReferenceLines(mission: GameReferencePack['missions'][number]): (string | null | undefined)[] {
  const card = mission.card
  return [
    ...mission.matchups.map(([you, opponent]) => `Matchup: ${you?.name ?? 'Unknown'} vs ${opponent?.name ?? 'Unknown'}`),
    mission.roundCap === null ? null : `Primary mission limit per battle round: ${mission.roundCap} VP`,
    mission.gameCap === null ? null : `Primary mission limit per game: ${mission.gameCap} VP`,
    mission.secondaryRoundCap === null ? null : `Secondary mission limit per battle round: ${mission.secondaryRoundCap} VP`,
    mission.secondaryGameCap === null ? null : `Secondary mission limit per game: ${mission.secondaryGameCap} VP`,
    card?.text,
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

const section = (baseUrl: string, id: string, title: string, lines: (string | null | undefined)[]): ReferenceSection | null => {
  const text = lines
    .map((line) => (line ? referenceText(line) : ''))
    .filter(Boolean)
    .join('\n')
  return text ? { id, title, text, url: `${baseUrl}#${id}` } : null
}

const present = (sections: (ReferenceSection | null)[]) => sections.filter((entry): entry is ReferenceSection => Boolean(entry))
const attribution = (value: string | null) => (value ? [value] : [])

function datasheetDocument(sheet: CanonicalDatasheet): ReferenceDocument {
  const route = sheet.referenceRoute ?? { catalogueId: sheet.catalogueId, slug: sheet.slug }
  const url = `/factions/${route.catalogueId}/datasheets/${route.slug}`
  const relationships = [...sheet.attachments, ...sheet.leaders, ...sheet.supporters].map((entry) => entry.name)
  return {
    id: `datasheet:${route.catalogueId}:${route.slug}`,
    kind: 'datasheet',
    title: sheet.name,
    faction: sheet.faction,
    url,
    revisions: revisionsForDatasheet(sheet),
    attribution: attribution(sheet.attribution),
    sections: present([
      section(url, 'summary', 'Summary', [
        sheet.faction,
        sheet.points === null ? null : `${sheet.points} points`,
        sheet.keywords.join(', '),
        ...sheet.composition,
        sheet.baseSize ? `Base size: ${sheet.baseSize}` : null,
        sheet.transport,
      ]),
      ...sheet.profiles.map((profile) =>
        section(
          url,
          `profile-${profile.id}`,
          profile.name,
          profile.values.map(
            (value) => `${value.name}: ${value.value}${value.modifiers?.length ? ` (${value.modifiers.join('; ')})` : ''}`,
          ),
        ),
      ),
      ...sheet.abilities.map((ability) =>
        section(url, `ability-${ability.id}`, ability.name, [ability.source, ability.description ?? 'Description unavailable.']),
      ),
      section(
        url,
        'keyword-rules',
        'Keyword rules',
        sheet.keywordRules.flatMap((rule) => [rule.name, rule.description]),
      ),
      section(url, 'loadout', 'Loadout', [sheet.loadout]),
      section(url, 'wargear', 'Wargear', [
        ...sheet.wargearOptions,
        ...(sheet.wargearGroups ?? []).flatMap((group) => [group.instruction, ...group.options]),
      ]),
      section(
        url,
        'points',
        'Points',
        sheet.costs.map((cost) =>
          [cost.models, 'models', cost.cost, 'points', cost.keyword, cost.faction, cost.detachment].filter(Boolean).join(' '),
        ),
      ),
      section(url, 'relationships', 'Attachments', relationships),
    ]),
  }
}

function revisionsForDatasheet(sheet: CanonicalDatasheet) {
  return Object.fromEntries(
    [
      ['definitions', sheet.provenance.definitions.revision],
      ['datacards', sheet.provenance.datacards?.revision],
      ['rules', sheet.provenance.rules?.revision],
    ].filter((entry): entry is [string, string] => Boolean(entry[1])),
  )
}

function detachmentDocument(detachment: CanonicalDetachment): ReferenceDocument {
  const url = `/factions/${detachment.factionSlug}/detachments/${detachment.slug}`
  return {
    id: `detachment:${detachment.factionSlug}:${detachment.slug}`,
    kind: 'detachment',
    title: detachment.name,
    faction: detachment.faction,
    url,
    revisions: {
      definitions: detachment.provenance.definitions.revision,
      rules: detachment.provenance.rules.revision,
      datacards: detachment.provenance.datacards.revision,
    },
    attribution: [detachment.attribution],
    sections: present([
      section(url, 'summary', 'Summary', [
        detachment.faction,
        detachment.points === null ? null : `${detachment.points} detachment points`,
        detachment.dispositions.join(', '),
      ]),
      ...detachment.rules.map((rule, index) =>
        section(url, `rule-${routeSlug(rule.name) || index + 1}`, rule.name, [rule.description ?? 'Description unavailable.']),
      ),
      ...detachment.enhancements.map((enhancement, index) =>
        section(url, `enhancement-${routeSlug(enhancement.name) || index + 1}`, enhancement.name, [
          enhancement.points === null ? null : `${enhancement.points} points`,
          enhancement.description ?? 'Description unavailable.',
        ]),
      ),
      ...detachment.upgrades.map((upgrade, index) =>
        section(url, `upgrade-${routeSlug(upgrade.name) || index + 1}`, upgrade.name, [
          upgrade.points === null ? null : `${upgrade.points} points`,
          upgrade.description ?? 'Description unavailable.',
        ]),
      ),
      ...detachment.stratagems.map((stratagem, index) =>
        section(url, `stratagem-${routeSlug(stratagem.name) || index + 1}`, stratagem.name, [
          `${stratagem.cp} CP`,
          stratagem.type,
          stratagem.phases.join(', '),
          stratagem.turn,
          stratagem.description ?? 'Description unavailable.',
        ]),
      ),
      section(
        url,
        'keyword-rules',
        'Keyword rules',
        detachment.keywordRules.flatMap((rule) => [rule.name, rule.description]),
      ),
    ]),
  }
}

function ruleDocuments(document: RuleDocument & { provenance: { datacards: { revision: string } } }): ReferenceDocument[] {
  return document.sections.flatMap((ruleSection) =>
    ruleSection.entries.map((entry) => ruleDocument(document, ruleSection.slug, ruleSection.title, entry)),
  )
}

function ruleDocument(
  document: RuleDocument & { provenance: { datacards: { revision: string } } },
  sectionSlug: string,
  sectionTitle: string,
  entry: RuleEntry,
): ReferenceDocument {
  const baseUrl = `/rules/${document.slug}/${sectionSlug}`
  const url = `${baseUrl}#${entry.anchor}`
  const main = section(baseUrl, entry.anchor, entry.title, [
    entry.code,
    entry.cost === null ? null : `${entry.cost} CP`,
    entry.lore,
    ...entry.facts.map((fact) => `${fact.label}: ${fact.markup}`),
    ...entry.blocks.flatMap((block) => (block.kind === 'clarification' ? [] : [block.kind === 'heading' ? block.text : block.markup])),
  ])
  const clarifications = entry.blocks.flatMap((block) =>
    block.kind === 'clarification' ? [section(baseUrl, block.anchor ?? entry.anchor, block.title, [block.code, block.markup])] : [],
  )
  return {
    id: `rule:${document.slug}:${entry.anchor}`,
    kind: 'rule',
    title: entry.title,
    faction: null,
    url,
    revisions: { datacards: document.provenance.datacards.revision },
    attribution: [DATACARDS_ATTRIBUTION],
    sections: present([main, ...clarifications, section(baseUrl, `context-${entry.anchor}`, 'Context', [document.title, sectionTitle])]),
  }
}

export function referenceDocumentMarkdown(document: ReferenceDocument): string {
  const context = [document.faction, document.kind].filter(Boolean).join(' · ')
  const sections = document.sections.map((entry) => `## ${entry.title}\n\n${entry.text}`).join('\n\n')
  const sources = document.attribution.length ? `\n\nSources: ${document.attribution.join('; ')}` : ''
  return `# ${document.title}\n\n${context}\n\n${sections}${sources}\n\nCanonical URL: ${document.url}\n`
}
