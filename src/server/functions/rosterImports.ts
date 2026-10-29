import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { battlebaseRosterSchema, battlebaseTextRoster } from '../../core/battlebaseRoster'
import { nameOf } from '../../core/catalogue'
import { fromNewRecruitShare, newRecruitShareId } from '../../core/newRecruit'
import type { TextRoster } from '../../core/textRoster'
import { importableRostersSchema } from '../../contracts/schemas'
import { app } from '../app'
import { battlebaseRosters } from '../battlebase'
import { battlebaseNames } from '../battlebaseData'
import { newRecruitShare } from '../newRecruit'
import { fixedWindowRateLimit } from '../rateLimit'
import { importParsedList } from '../rosterImport'
import { inTurn, mutationRpc } from '../rpc'

const rateLimit = fixedWindowRateLimit('too many roster searches')

/**
 * The lists another app holds that can be imported, each read and matched the way a pasted list
 * is: a player's public BattleBase rosters, or the lists New Recruit share links open. Each list
 * streams in as it is read, and one that cannot be read is named with the reason, never left out.
 */
export const findImportableRosters = createServerFn({ method: 'POST' })
  .validator(importableRostersSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const limited = rateLimit(getRequest(), 10)
      if (limited) throw limited
      const instance = app()
      const loaded = instance.catalogue()
      if (!loaded) throw new Response('Army data is unavailable. Try again later.', { status: 503 })
      const factions = (await instance.factionsFor())?.factions ?? []
      const read = async (key: string, list: TextRoster, format: 'battlebase' | 'newrecruit') =>
        list.units.length
          ? { kind: 'read' as const, key, imported: await importParsedList(list, format, factions) }
          : { kind: 'unread' as const, key, problem: `${list.name} has no units yet.` }
      if (data.source === 'battlebase') {
        const [rosters, names] = await Promise.all([battlebaseRosters(data.username), battlebaseNames()])
        if (!rosters) return { found: false as const }
        return {
          found: true as const,
          rosters: inTurn(rosters, async (roster) => {
            let parsed: ReturnType<typeof battlebaseRosterSchema.safeParse> | null = null
            try {
              parsed = battlebaseRosterSchema.safeParse(JSON.parse(roster.data))
            } catch {
              // An unreadable roster is reported below like any other.
            }
            const list = parsed?.success ? battlebaseTextRoster(parsed.data, names) : null
            if (!list)
              return { kind: 'unread' as const, key: roster.id, problem: 'BattleBase’s data no longer names everything in this roster.' }
            return read(roster.id, list, 'battlebase')
          }),
        }
      }
      // Entry ids are the same in every rules version, so the current catalogue names them all.
      const named = (id: string) => {
        const definition = loaded.index.definitions.get(id)
        return definition && nameOf(definition, loaded.index.definitions)
      }
      // Every link is asked for at once and read in turn; a failed ask is answered in its turn.
      const asked = data.links.map((link) => {
        const id = newRecruitShareId(link)
        const share = id ? newRecruitShare(id) : null
        share?.catch(() => {})
        return { link, id, share }
      })
      const rosters = inTurn(asked, async ({ link, id, share }) => {
        if (!id || !share) return { kind: 'unread' as const, key: link, problem: 'This is not a New Recruit share link.' }
        const opened = await share
        const list = opened && fromNewRecruitShare(opened, named)
        if (!list) return { kind: 'unread' as const, key: id, problem: 'This link does not open a list.' }
        return read(id, list, 'newrecruit')
      })
      return { found: true as const, rosters }
    }),
  )
