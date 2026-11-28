import { z } from 'zod'
import { rosterIdSchema, tokenSchema } from '../contracts/schemas'
import { currentCatalogueFamilyId } from '../core/retiredCatalogueIds'
import { rosterDiscoveryCursorSchema, ROSTER_SEARCH_MAX_LENGTH } from '../core/rosterDiscovery'
import { ROSTER_SORTS } from '../core/rosterSort'
import { agentBattle, facet, myBattlesSchema } from './accountMcp'
import { reportAfter, reportPage, REPORT_PAGING } from './battleTools'
import { READ_ONLY_TOOL, structured, toolError, type AgentTools } from './agentTools'
import { app } from './app'
import { withFactionSlugs } from '../shared/factionNames'
import { CombatRefusal, detachmentId } from './combatTools'
import { activeReferenceCorpus } from './referenceApi'
import { referenceFaction } from './referenceService'
import { discoverRosterPage } from './rosterDiscoveryPage'
import { reusableRoster, rosterSummary } from './rosterTools'
import { BATTLES_PAGE } from './services/battleFeedService'

const unavailable = () => toolError('unavailable', 'Praetorium army data is temporarily unavailable.')

const publicBattlesSchema = myBattlesSchema.extend({
  filter: myBattlesSchema.shape.filter
    .unwrap()
    .omit({ result: true })
    .extend({
      faction: facet('faction slugs one side fielded, as list_factions gives them, such as necrons'),
      against: facet('faction slugs fielded against that same side, so faction necrons with against orks finds Necrons facing Orks'),
      detachment: facet('detachment names one side fielded, exactly as shown, such as Awakened Dynasty'),
      againstDetachment: facet('detachment names fielded against that same side'),
      type: facet(
        'guest, team, manual (table keeps its own score), organised (counts for a group or tournament); practice battles are never listed',
      ),
    })
    .optional(),
})

const publicRostersSchema = z.object({
  faction: z.string().trim().min(1).max(160).optional().describe('Faction id, URL slug, or display name from list_factions.'),
  detachment: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .optional()
    .describe('With faction, a detachment id, slug, or name from list_units, to list only rosters that took it.'),
  battleSize: z.int().min(1).max(10_000).optional().describe('Only rosters built for this battle size in points, such as 2000.'),
  q: z
    .string()
    .trim()
    .min(1)
    .max(ROSTER_SEARCH_MAX_LENGTH)
    .optional()
    .describe('Text matched against roster, owner, faction and detachment names.'),
  legalOnly: z.boolean().default(false).describe('Only rosters the current army data can field without problems.'),
  sort: z.enum(ROSTER_SORTS).default('updated-desc').describe('updated-desc, the default, lists the most recently saved first.'),
  before: rosterDiscoveryCursorSchema.nullish().describe('nextCursor from the previous page; omit for the first page.'),
})

/** Battles and rosters players have made public, read the same for every caller so an answer never depends on who asked. */
export function registerPublicPlayTools(server: AgentTools) {
  server.registerTool(
    'list_public_battles',
    {
      title: 'List public battles',
      description: `Lists the battles anyone may watch on Praetorium, newest first, up to ${BATTLES_PAGE} a page, narrowed and ordered as the battles page's public tab is. Each battle has its url, token, status, ending, size, mission and one entry per seat (side, result once finished, army, faction, detachments, score with its primary and secondary halves, rating change). A filtered page can come back short or empty while nextCursor is set; keep paging until nextCursor is null. Read one with get_public_battle.`,
      inputSchema: publicBattlesSchema,
      annotations: READ_ONLY_TOOL,
    },
    async ({ before, filter, order }) => {
      const instance = app()
      const [rules, factions] = await Promise.all([instance.rulesFor(), instance.battleFactionsFor()])
      const read = filter && withFactionSlugs(filter, factions)
      const { battles, nextCursor } = await instance.service.battleFeedService.publicBattles(
        null,
        rules,
        { limit: BATTLES_PAGE, before, filter: read, order },
        factions,
      )
      return structured({ battles: battles.map((battle) => agentBattle(battle, null)), nextCursor })
    },
  )
  server.registerTool(
    'get_public_battle',
    {
      title: 'Read a battle as a spectator',
      description: `Returns any battle by a token from list_public_battles or its link, as a spectator sees it on the site: battle holds its settings, round, phase, result and each player's army, score, command points and secondary cards; missions the mission each side plays; report its log as the report reads it, ${REPORT_PAGING} Practice battles are left out of list_public_battles but still open from their link.`,
      inputSchema: { token: tokenSchema.shape.token, after: reportAfter },
      annotations: READ_ONLY_TOOL,
    },
    async ({ token, after }) => {
      const instance = app()
      const screen = await instance.service.screen(token, null, await instance.rulesFor()).catch((error: unknown) => {
        if (error instanceof Response && error.status === 404) return null
        throw error
      })
      if (screen?.kind !== 'spectator') return toolError('not_found', 'No battle has this token. Use one from list_public_battles.')
      const { entries, nextAfter } = reportPage(screen.report, after)
      return structured({
        url: `/battles/${encodeURIComponent(token)}`,
        battle: screen.view,
        missions: screen.missions,
        report: entries,
        nextAfter,
      })
    },
  )
  server.registerTool(
    'list_public_rosters',
    {
      title: 'List public rosters',
      description:
        "Lists the rosters players have made public on Praetorium, as the rosters page's public tab shows them, most recently saved first unless sort says otherwise. Each roster has its id, url, name, owner, faction, detachments, battle size, points under today's army data and problem, the first thing stopping it being fielded or null when it is legal. total counts every match when it is known. A page can come back short while nextCursor is set; keep paging until it is null. Read one with get_public_roster. These are players' own lists, not tournament results: for what wins, use list_winning_lists.",
      inputSchema: publicRostersSchema,
      annotations: READ_ONLY_TOOL,
    },
    async ({ faction, detachment, battleSize, q, legalOnly, sort, before }) => {
      const corpus = await activeReferenceCorpus()
      if (!corpus) return unavailable()
      const found = faction ? referenceFaction(corpus, faction) : null
      if (faction && !found)
        return toolError('not_found', `No faction is named ${faction}. Use a faction id, slug, or name from list_factions.`)
      if (detachment && !found) return toolError('validation', 'Name a faction to filter by detachment.')
      let wanted: string | undefined
      if (found && detachment) {
        const loaded = await app().catalogueFor(found.id)
        if (!loaded) return unavailable()
        try {
          wanted = detachmentId(loaded, found.id, detachment)
        } catch (error) {
          if (error instanceof CombatRefusal) return toolError(error.type, error.reasons.join(' '))
          throw error
        }
      }
      const only = (value: string | undefined) => (value ? { in: [value], out: [] } : undefined)
      const page = await discoverRosterPage(
        {
          audience: 'public',
          sort,
          before: before ?? null,
          q,
          faction: only(found ? currentCatalogueFamilyId(found.id) : undefined),
          detachment: only(wanted),
          size: only(battleSize ? String(battleSize) : undefined),
          legality: only(legalOnly ? 'legal' : undefined),
        },
        null,
      )
      const indexed = (await app().factionIndexFor())?.factions ?? []
      const factionNames = new Map(indexed.map((option) => [option.id, option.displayName]))
      const names = new Map(indexed.flatMap((option) => option.detachments.map((known) => [known.id, known.name] as const)))
      return structured({
        rosters: page.rosters.map(({ roster, owner, points, problem }) => ({
          id: roster.id,
          url: `/rosters/${encodeURIComponent(roster.id)}`,
          name: roster.name,
          owner: { id: owner.id, name: owner.name },
          faction: { id: roster.catalogueId, name: factionNames.get(roster.catalogueId) ?? roster.catalogueId },
          detachments: roster.detachmentIds.map((id) => names.get(id) ?? id),
          battleSize: roster.limit,
          points,
          problem,
          updatedAt: new Date(roster.updatedAt).toISOString(),
        })),
        total: page.total,
        nextCursor: page.nextCursor,
      })
    },
  )
  server.registerTool(
    'get_public_roster',
    {
      title: 'Read a public roster',
      description:
        "Returns a roster anyone may open, by an id from list_public_rosters or from a roster link someone shared: public and unlisted rosters, never private ones. summary names each unit with its points, models, wargear, enhancements, Warlord and attachments, and gives the total and any problems under today's army data; it is null while army data is unavailable. roster holds the choices by catalogue id, the shape check_roster, grade_roster, compare_rosters and save_roster take, so grade it or set it against another list rather than judging it yourself.",
      inputSchema: rosterIdSchema.shape,
      annotations: READ_ONLY_TOOL,
    },
    async ({ id }) => {
      const access = await app().service.rosterService.rosterAccess(id, null)
      if (!access)
        return toolError(
          'not_found',
          "No public or unlisted roster has this id. If it is the signed-in player's own private roster, read it with get_my_roster; otherwise use an id from list_public_rosters.",
        )
      return structured({
        url: `/rosters/${encodeURIComponent(id)}`,
        summary: await rosterSummary(access.roster),
        roster: reusableRoster(access.roster),
      })
    },
  )
}
