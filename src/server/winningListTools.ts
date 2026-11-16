import { z } from 'zod'
import { groupBy } from '../core/collections'
import { READ_ONLY_TOOL, structured, toolError, type AgentTools } from './agentTools'
import { app } from './app'
import { CombatRefusal, detachmentId } from './combatTools'
import { changeLogPage } from './catalogueChangePages'
import { activeReferenceCorpus } from './referenceApi'
import type { ReferenceCorpus } from './referenceCorpus'
import { referenceFaction } from './referenceService'
import { rosterSummary } from './rosterTools'
import { fieldedDatasheets, matchingLists, WINNING_LIST_GONE, type WinningList } from './winningLists'

const MAX_LISTS = 50

/** Each name with how many times it appears, most first. */
const tallied = (names: readonly string[]) =>
  [...groupBy(names, (name) => name)]
    .map(([name, copies]) => ({ name, lists: copies.length }))
    .toSorted((left, right) => right.lists - left.lists || left.name.localeCompare(right.name))

const unavailable = () => toolError('unavailable', 'Praetorium army data is temporarily unavailable.')

const STILL_CHECKING =
  'Praetorium is still checking which placings import cleanly under today’s army data, so these lists and counts are partial. Ask again in a few minutes for the full set.'

/** A placing as an agent reads it, with its detachments and Force disposition named rather than as ids. */
function placingSummary(corpus: ReferenceCorpus, dispositions: ReadonlyMap<string, string> | undefined, list: WinningList) {
  return {
    id: list.id,
    url: `/rosters/winning/${list.id}`,
    name: list.name,
    placing: list.placing,
    record: list.record,
    event: list.event,
    detachments: list.detachmentIds.map((id) => {
      const copies = corpus.catalogue.detachments.filter((candidate) => candidate.id === id)
      return (copies.find((candidate) => candidate.catalogueId === list.catalogueId) ?? copies[0])?.name ?? id
    }),
    disposition: list.disposition && (dispositions?.get(list.disposition) ?? list.disposition),
    battleSize: list.limit,
    points: list.points,
  }
}

export function registerWinningListTools(server: AgentTools) {
  server.registerTool(
    'list_winning_lists',
    {
      title: 'List tournament-winning lists',
      description:
        "Lists a faction's top-four tournament placings from 40k Stats whose lists import cleanly and are legal under today's army data, as the site's Tournament lists show them, newest first. A faction counts its whole family, so a list imported under an earlier rules version still counts. of is how many lists matched and events the date range of their events; a small of is a small sample. latestUpdate is the date of the faction's newest points or datasheet update and sinceLatestUpdate how many lists come from events since; lists from before it were built for other points, so weigh them less or pass since. detachments counts how many lists took each detachment. battleSizes counts the faction's lists at each size: when it has none at the size being built, say so, and read other sizes' lists as which units the faction favours rather than as a shape to copy. datasheets names every datasheet those lists field with how many of them field it, most first, and the unit sizes taken, most common first. Each list gives its placing, record, event, detachments, Force disposition, points and units with every copy's model count; pass its id to get_winning_list for the full list as a draft. A placing reflects the player and the field as much as the list: learn the shapes and staples these lists share rather than copying one. While checking is true the first import is still running and every count is partial; say so.",
      inputSchema: {
        faction: z.string().trim().min(1).max(160).describe('Faction id, URL slug, or display name from list_reference or list_units.'),
        detachment: z
          .string()
          .trim()
          .min(1)
          .max(160)
          .optional()
          .describe('Detachment id, slug, or name from list_units, to list only placings that took it.'),
        battleSize: z.int().min(1).max(10_000).optional().describe('Only placings at this battle size in points, such as 2000.'),
        since: z.iso
          .date()
          .optional()
          .describe('Only placings from events on or after this date (YYYY-MM-DD), such as the latestUpdate an earlier call returned.'),
        count: z.int().min(1).max(MAX_LISTS).default(10).describe('How many of the newest matching lists to return in full.'),
      },
      annotations: READ_ONLY_TOOL,
    },
    async ({ faction, detachment, battleSize, since, count }) => {
      const corpus = await activeReferenceCorpus()
      if (!corpus) return unavailable()
      const found = referenceFaction(corpus, faction)
      if (!found) return toolError('not_found', `No faction is named ${faction}. Use a faction id, slug, or name from list_factions.`)
      const [loaded, rules] = await Promise.all([app().catalogueFor(found.id), app().rulesFor(found.id)])
      if (!loaded) return unavailable()
      let wanted: string | undefined
      try {
        wanted = detachment ? detachmentId(loaded, found.id, detachment) : undefined
      } catch (error) {
        if (error instanceof CombatRefusal) return toolError(error.type, error.reasons.join(' '))
        throw error
      }
      const { lists, checking } = app().winningLists.lists()
      const matched = matchingLists(lists ?? [], found.id, { detachmentId: wanted, battleSize }).filter(
        (list) => !since || list.event.date >= since,
      )
      const dates = matched.map((list) => list.event.date).toSorted()
      const sizes = tallied(matchingLists(lists ?? [], found.id, { detachmentId: wanted }).map((list) => String(list.limit))).map(
        ({ name, lists: fielded }) => ({ battleSize: Number(name), lists: fielded }),
      )
      const recorded = (await changeLogPage({ faction: found.slug })).updates[0]?.recordedAt
      const latestUpdate = recorded ? new Date(recorded).toISOString().slice(0, 10) : null
      return structured(
        {
          faction: { id: found.id, name: found.name },
          checking,
          ...(checking ? { note: STILL_CHECKING } : {}),
          of: matched.length,
          battleSizes: sizes,
          events: { from: dates[0] ?? null, to: dates.at(-1) ?? null },
          latestUpdate,
          ...(latestUpdate ? { sinceLatestUpdate: matched.filter((list) => list.event.date >= latestUpdate).length } : {}),
          detachments: tallied(matched.flatMap((list) => placingSummary(corpus, rules?.dispositions, list).detachments)),
          datasheets: fieldedDatasheets(matched),
          lists: matched.slice(0, count).map((list) => ({
            ...placingSummary(corpus, rules?.dispositions, list),
            units: list.datasheets.map(({ name, models }) => ({ name, models })),
          })),
        },
        { lists: matched.length, checking, detachment: Boolean(detachment) },
      )
    },
  )
  server.registerTool(
    'get_winning_list',
    {
      title: 'Read a tournament-winning list',
      description:
        "Reads one top-four tournament placing from list_winning_lists as it imports under today's army data: its placing, record and event, the army text the player submitted, draft (the list in the shape check_roster, grade_roster, compare_rosters and save_roster take) and summary, which names each unit with its points, models, wargear, enhancements, Warlord and attachments. Grade the draft with grade_roster or set it against another list with compare_rosters rather than judging it yourself.",
      inputSchema: { id: z.string().trim().min(1).max(64).describe('A list id from list_winning_lists.') },
      annotations: READ_ONLY_TOOL,
    },
    async ({ id }) => {
      const found = await app().winningLists.list(id)
      if (!found) return toolError('not_found', WINNING_LIST_GONE)
      const [corpus, rules, summary] = await Promise.all([
        activeReferenceCorpus(),
        app().rulesFor(found.list.catalogueId),
        rosterSummary(found.draft),
      ])
      if (!corpus || !summary) return unavailable()
      return structured({ list: placingSummary(corpus, rules?.dispositions, found.list), text: found.text, draft: found.draft, summary })
    },
  )
}
