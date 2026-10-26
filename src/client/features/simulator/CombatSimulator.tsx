import { noExclusions } from '../../../core/combatMatchup'
import { GuideHelp } from '../onboarding/GuideHelp'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { posthog } from 'posthog-js'
import { ArrowLeftRight, BookOpen } from 'lucide-react'
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { PageContent, PageHeader } from '../../components/Page'
import { advanceOnboarding, ONBOARDING_FOCUS_EVENT } from '../onboarding/onboarding'
import { CombatantCard } from './CombatantCard'
import { CombatMatchup } from './CombatMatchup'
import { CombatBuffControls } from './CombatBuffControls'
import { PICKER_POPUP, SimulationMode } from './CombatControls'
import { RosterPicker } from './RosterPicker'
import { RosterCombatComparison } from './RosterCombatComparison'
import { type Combatant, type CombatRoster, useCombatant } from './useCombatant'
import { attachedUnit } from '../../../core/attachedUnits'
import {
  decodeSimulatorState,
  encodeSimulatorState,
  type MatchupSettings,
  type SimulatorSide,
  rosterSourceKey,
  type SimulatorRosterSource,
  type SimulatorState,
} from '../../../contracts/simulatorState'
import { combatUnitsQuery, factionIndexQuery, leagueRosterQuery, sharedRosterQuery } from '../../queries'
import type { LocalRoster } from '../../offline/localRuntime'
import { rosterTitle } from '../rosters/RosterSummary'
import { exampleMatchup, useMatchupHistory } from './matchupHistory'
import { RecentSimulations } from './RecentSimulations'
import { sealedCombatRoster } from './rosterCombat'
import { friendLeagueLabel, friendLeagueSource, OwnerName, useRosterOwners, useSimulatorRosters } from './rosterOwners'
import type { RecentMatchup } from '../../../core/recentMatchups'

const NO_ROSTER = 'none'

/** A link's roster side with that roster's current contents; null when the roster or its unit is gone. */
function savedRosterSide(side: SimulatorSide, roster: CombatRoster | null, name: string): CombatRoster | null {
  if (!roster || roster.catalogueId !== side.catalogueId) return null
  const { pickIndex, ...source } = side.roster!
  const index =
    roster.picks[pickIndex]?.entryId === side.pick.entryId
      ? pickIndex
      : roster.picks.findIndex((pick) => pick.entryId === side.pick.entryId && pick.attachedTo === undefined)
  return index < 0 ? null : { ...roster, pickIndex: index, saved: { source, name } }
}

const savedCombatRoster = (roster: LocalRoster | null | undefined): CombatRoster | null => (roster ? { ...roster, pickIndex: 0 } : null)

/** The standalone page keeps its matchup in the URL, so a link reopens the same calculation. */
export function CombatSimulator({
  shared,
  onShare,
  reference,
}: {
  shared?: string
  onShare: (shared: string | undefined) => void
  /** The reference page that opened the simulator, if one did. */
  reference?: 'datasheet'
}) {
  const [comparingRosters, setComparingRosters] = useState(false)
  const [session, setSession] = useState(() => ({ key: 0, shared }))
  const rosterRequests = useRef<[number, number]>([0, 0])
  const [problem, setProblem] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const units = useQuery(combatUnitsQuery())
  const history = useMatchupHistory()
  const { saved, friendRosters, leagueRosters } = useSimulatorRosters()
  const factions = useQuery(factionIndexQuery())
  const titled = (roster: Parameters<typeof rosterTitle>[0] & { catalogueId: string }) =>
    rosterTitle(
      roster,
      factions.data?.factions.find((faction) => faction.id === roster.catalogueId),
    )
  const savedRosters = (saved.data ?? []).filter((roster) => !roster.archived)
  useEffect(() => {
    if (session.shared !== shared) onShare(session.shared)
  }, [session.shared, shared, onShare])
  const ownerOf = useRosterOwners()
  const leagueSources = new Map<string, SimulatorRosterSource>(
    leagueRosters.map((entry) => {
      const source = friendLeagueSource(entry)
      return [rosterSourceKey(source), source]
    }),
  )
  const example = units.data ? exampleMatchup(units.data) : null
  const linked = decodeSimulatorState(session.shared)
  const linkedSources = linked?.sides.flatMap((side) => (side?.roster ? [side.roster] : [])) ?? []
  const linkedIds = [...new Set(linkedSources.flatMap((source) => ('id' in source ? [source.id] : [])))]
  const linkedLeagues = new Map(linkedSources.flatMap((source) => ('league' in source ? [[rosterSourceKey(source), source.league]] : [])))
  const linkedRosters = useQueries({ queries: linkedIds.map((id) => sharedRosterQuery(id)) })
  const linkedLeagueRosters = useQueries({
    queries: [...linkedLeagues.values()].map(({ token, eventToken, userId }) => leagueRosterQuery(token, eventToken, userId)),
  })
  const linkedRoster = (source: SimulatorRosterSource) => {
    if ('id' in source) {
      const roster = linkedRosters[linkedIds.indexOf(source.id)]?.data
      return { roster: savedCombatRoster(roster), name: roster ? titled({ ...roster, unitCount: roster.picks.length }) : '' }
    }
    const roster = linkedLeagueRosters[[...linkedLeagues.keys()].indexOf(rosterSourceKey(source))]?.data
    return { roster: sealedCombatRoster(roster), name: roster?.name ?? '' }
  }
  const sides = linked?.sides.map((side) => {
    if (!side?.roster) return { side, roster: undefined }
    const { roster, name } = linkedRoster(side.roster)
    const combat = savedRosterSide(side, roster, name)
    return { side: combat ? side : null, roster: combat ?? undefined }
  })
  // A linked roster this player does not otherwise list, such as another player's roster they opened.
  const listed = new Set([...savedRosters.map(({ id }) => id), ...friendRosters.map(({ roster }) => roster.id), ...leagueSources.keys()])
  const otherRosters = [...new Map(linkedSources.map((source) => [rosterSourceKey(source), source])).entries()].flatMap(([key, source]) => {
    const { roster, name } = linkedRoster(source)
    return listed.has(key) || !roster ? [] : [{ id: key, label: name, catalogueId: roster.catalogueId }]
  })
  const loadingRoster = [...linkedRosters, ...linkedLeagueRosters].some((query) => query.isPending)
  const missingRoster =
    !loadingRoster && Boolean(sides?.some(({ side, roster }, index) => linked?.sides[index]?.roster && (!side || !roster)))
  // The emptied side leaves the link on its next change, so the notice is kept until another link opens.
  if (missingRoster && !problem) setProblem('A roster in this simulation is no longer available, so its side is empty.')
  const restore = (value: string) => {
    const initial = decodeSimulatorState(value)
    if (!initial) return
    rosterRequests.current[0]++
    rosterRequests.current[1]++
    setSession((current) => ({ key: current.key + 1, shared: value }))
    setComparingRosters(false)
    setProblem(null)
  }
  const chooseRoster = async (index: 0 | 1, key: string) => {
    const request = ++rosterRequests.current[index]
    let side: SimulatorSide | null = null
    if (key !== NO_ROSTER) {
      const linkedLeague = linkedLeagues.get(key)
      const source = leagueSources.get(key) ?? (linkedLeague ? { league: linkedLeague } : { id: key })
      const { league } = 'league' in source ? source : {}
      const roster = await (
        league
          ? queryClient.query(leagueRosterQuery(league.token, league.eventToken, league.userId)).then(sealedCombatRoster)
          : queryClient.query(sharedRosterQuery(key)).then(savedCombatRoster)
      ).catch(() => null)
      if (request !== rosterRequests.current[index]) return
      const pickIndex = roster?.picks.findIndex((pick) => pick.attachedTo === undefined) ?? -1
      const host = roster?.picks[pickIndex]
      if (!roster || !host) {
        setProblem(roster ? 'That roster has no units yet.' : 'That roster could not be opened.')
        return
      }
      const { attachedTo: _attachedTo, note: _note, ...pick } = host
      side = { catalogueId: roster.catalogueId, pick, rules: {}, roster: { ...source, pickIndex } }
    }
    setSession((current) => {
      const state = decodeSimulatorState(current.shared)
      const next = [...(state?.sides ?? [null, null])] as SimulatorState['sides']
      next[index] = side
      return { key: current.key + 1, shared: encodeSimulatorState({ v: 1, sides: next, swapped: state?.swapped ?? false }) }
    })
    setComparingRosters(false)
    setProblem(null)
  }
  const rosterControl = (index: 0 | 1) => {
    const sideOwner = ownerOf(sides?.[index]?.roster?.saved?.source)
    return savedRosters.length || friendRosters.length || leagueSources.size || otherRosters.length ? (
      <div className="mb-3 text-xs text-dim">
        <span className="flex min-w-0 items-center justify-between gap-2">
          Roster
          {sideOwner ? <OwnerName owner={sideOwner} className="text-bone" /> : null}
        </span>
        <RosterPicker
          ariaLabel={`${index ? 'Second' : 'First'} roster`}
          className="mt-1"
          popupClassName={PICKER_POPUP}
          searchPlaceholder="Search rosters…"
          groups={[
            {
              label: 'Catalogue',
              options: [{ id: NO_ROSTER, label: 'No roster', icon: <BookOpen className="size-4 text-info" aria-hidden /> }],
            },
            { label: 'Opened rosters', options: otherRosters },
            {
              label: 'Your rosters',
              options: savedRosters.map((roster) => ({ id: roster.id, label: titled(roster), catalogueId: roster.catalogueId })),
            },
            {
              label: "Friends' rosters",
              options: friendRosters.map(({ roster, owner }) => ({
                id: roster.id,
                label: `${titled(roster)} · ${owner.name}`,
                catalogueId: roster.catalogueId,
              })),
            },
            {
              label: "Friends' sealed rosters",
              options: leagueRosters.map((entry) => ({
                id: rosterSourceKey(friendLeagueSource(entry)),
                label: friendLeagueLabel(entry),
                catalogueId: entry.catalogueId,
              })),
            },
          ]}
          value={sides?.[index]?.roster?.saved ? rosterSourceKey(sides[index].roster.saved.source) : NO_ROSTER}
          onValueChange={(id) => void chooseRoster(index, id)}
        />
      </div>
    ) : undefined
  }
  const share = useCallback((state: SimulatorState) => {
    const encoded = state.sides.some(Boolean) ? encodeSimulatorState(state) : undefined
    setSession((current) => (current.shared === encoded ? current : { ...current, shared: encoded }))
  }, [])
  return (
    <main className="w-full">
      <PageHeader
        eyebrow={null}
        title="Combat simulator"
        description="Compare shooting and melee between units or whole rosters. Try an editable Intercessors vs Necron Warriors example, or choose your own matchup."
        actions={
          <div className="space-y-2">
            <GuideHelp task="simulator">First matchup guide</GuideHelp>
            <Button
              variant="outline"
              className="min-h-11"
              disabled={!example}
              onClick={() => {
                if (!example) return
                posthog.capture('combat_simulator_example_started')
                restore(encodeSimulatorState(example))
              }}
            >
              Try an example
            </Button>
            {!units.isPending && !example ? <p className="text-sm text-dim">Example unavailable. Choose your own units below.</p> : null}
          </div>
        }
      />
      <PageContent>
        <SimulationMode
          rosters={comparingRosters}
          onChange={setComparingRosters}
          units={
            <div className="space-y-6">
              {problem ? <output className="block text-sm text-dim">{problem}</output> : null}
              {loadingRoster ? (
                <p className="border border-edge bg-panel p-4 text-sm text-dim">Loading roster…</p>
              ) : (
                <CombatSimulatorMatchup
                  key={session.key}
                  roster={sides?.[0]?.roster}
                  opponentRoster={sides?.[1]?.roster}
                  firstArmyControl={rosterControl(0)}
                  secondArmyControl={rosterControl(1)}
                  initial={linked && sides ? { ...linked, sides: [sides[0]!.side, sides[1]!.side] } : null}
                  onChange={share}
                  onRemember={history.remember}
                  reference={reference}
                />
              )}
              <RecentSimulations surface="simulator" onOpen={restore} />
            </div>
          }
          comparison={
            <div className="border border-edge bg-panel">
              <RosterCombatComparison />
            </div>
          }
        />
      </PageContent>
    </main>
  )
}

/** The selected unit, everything attached to it, and its roster, so a recent simulation names them too. */
function joinedUnitName(combatant: Combatant) {
  const { pickIndex, picks, price, rosterName } = combatant
  const unit = [pickIndex, ...attachedUnit(picks.positioned, pickIndex)]
    .flatMap((index) => price.data?.units[index]?.name ?? [])
    .join(' + ')
  return (rosterName ? `${unit} · ${rosterName}` : unit).slice(0, 200)
}

export function CombatSimulatorMatchup({
  source = 'standalone',
  roster,
  opponentRoster,
  firstArmyControl,
  secondArmyControl,
  inDialog = false,
  initial,
  onChange,
  onRemember,
  reference,
}: {
  source?: 'standalone' | 'roster' | 'battle'
  roster?: CombatRoster
  opponentRoster?: CombatRoster
  firstArmyControl?: ReactNode
  secondArmyControl?: ReactNode
  inDialog?: boolean
  initial?: SimulatorState | null
  onChange?: (state: SimulatorState) => void
  /** Keeps a completed pairing in the player's recent simulations; only the standalone simulator supplies it. */
  onRemember?: (entry: RecentMatchup) => void
  reference?: 'datasheet'
}) {
  const opened = useRef(false)
  useEffect(() => {
    if (opened.current) return
    opened.current = true
    posthog.capture('combat_simulator_opened', { source, ...(reference ? { reference } : {}) })
  }, [source, reference])
  const initialFirst = initial?.sides[0]
  const initialSecond = initial?.sides[1]
  const first = useCombatant(
    roster,
    initialFirst && {
      ...initialFirst,
      preferences: initialFirst.preferences ?? (!initial?.swapped ? initial?.matchup?.preferences : undefined),
    },
  )
  const second = useCombatant(
    opponentRoster,
    initialSecond && {
      ...initialSecond,
      preferences: initialSecond.preferences ?? (initial?.swapped ? initial?.matchup?.preferences : undefined),
    },
  )
  const [reversed, setReversed] = useState(initial?.swapped ?? false)
  const [attacker, defender] = reversed ? [second, first] : [first, second]
  const checkpoints = useRef(new Set<string>())
  const failed = attacker.price.isError || attacker.sheets.isError || defender.price.isError || defender.sheets.isError
  useEffect(() => {
    const steps = [
      ...(attacker.pick ? ['attacker_selected'] : []),
      ...(defender.pick ? ['defender_selected'] : []),
      ...(attacker.ready && defender.ready && !failed ? ['ready'] : []),
      ...(failed ? ['load_failed'] : []),
    ]
    for (const step of steps) {
      if (checkpoints.current.has(step)) continue
      checkpoints.current.add(step)
      posthog.capture('combat_simulator_setup_progressed', { source, step })
    }
  }, [source, attacker.pick, defender.pick, attacker.ready, defender.ready, failed])
  const matchupKey = `${reversed}:${attacker.identity}:${defender.identity}`
  const activeMatchup = useRef(matchupKey)
  useLayoutEffect(() => {
    activeMatchup.current = matchupKey
  }, [matchupKey])
  const [displayKey, setDisplayKey] = useState(matchupKey)
  if (attacker.ready && defender.ready && displayKey !== matchupKey) setDisplayKey(matchupKey)
  const [settings, setSettings] = useState(() => ({ key: matchupKey, value: initial?.matchup }))
  const reportSettings = useCallback(
    (value: MatchupSettings) => {
      if (displayKey !== matchupKey || activeMatchup.current !== matchupKey) return
      setSettings((current) =>
        current.key === matchupKey && JSON.stringify(current.value) === JSON.stringify(value) ? current : { key: matchupKey, value },
      )
    },
    [matchupKey, displayKey],
  )
  const matchup = {
    ...((settings.key === matchupKey ? settings.value : undefined) ?? {
      adjustments: {},
      excluded: noExclusions(),
      allocation: [],
    }),
    preferences: attacker.weaponPreferences,
  }
  const calculated = useRef<string | null>(null)
  const state = JSON.stringify({ v: 1, sides: [first.shared, second.shared], swapped: reversed, matchup })
  useEffect(() => {
    onChange?.(JSON.parse(state) as SimulatorState)
  }, [state, onChange])
  useEffect(() => {
    const advance = () => {
      if (attacker.snapshot) advanceOnboarding('simulator', 'simulator-attacker', 'simulator-defender')
      if (attacker.snapshot && defender.snapshot && calculated.current === state)
        advanceOnboarding('simulator', 'simulator-defender', 'simulator-results')
    }
    advance()
    window.addEventListener(ONBOARDING_FOCUS_EVENT, advance)
    return () => window.removeEventListener(ONBOARDING_FOCUS_EVENT, advance)
  }, [attacker.snapshot, defender.snapshot, state])
  return (
    <CombatMatchup
      entryPoint={source}
      key={displayKey}
      initialSettings={matchup}
      onSettingsChange={reportSettings}
      onCompleted={() => {
        calculated.current = state
        advanceOnboarding('simulator', 'simulator-defender', 'simulator-results')
        if (!onRemember || !attacker.ready || !defender.ready || !attacker.unit || !defender.unit) return
        onRemember({
          shared: encodeSimulatorState(JSON.parse(state) as SimulatorState),
          attacker: joinedUnitName(attacker),
          defender: joinedUnitName(defender),
        })
      }}
      preferences={attacker.weaponPreferences}
      invalidatedPreferences={attacker.invalidatedPreferences}
      onPreferencesChange={attacker.setWeaponPreferences}
      attacker={attacker.snapshot}
      defender={defender.snapshot}
      pending={!attacker.ready || !defender.ready}
      failed={failed}
      invalidAttachments={{
        attacker: Boolean(attacker.sheets.data?.attachmentErrors.length),
        defender: Boolean(defender.sheets.data?.attachmentErrors.length),
      }}
      inDialog={inDialog}
      loadoutSpace={attacker.loadoutSpace}
      attackerControl={
        <CombatantCard
          side="Attacker"
          combatant={attacker}
          armyControl={reversed ? secondArmyControl : firstArmyControl}
          headingAction={
            <Button
              variant="outline"
              size="icon-sm"
              className="bg-panel text-dim active:not-aria-[haspopup]:translate-y-0"
              aria-label="Swap attacker and defender"
              title="Swap attacker and defender"
              onClick={() => setReversed((current) => !current)}
              disabled={!attacker.snapshot || !defender.snapshot || !attacker.ready || !defender.ready || failed}
            >
              <ArrowLeftRight aria-hidden />
            </Button>
          }
        />
      }
      defenderControl={<CombatantCard side="Defender" combatant={defender} armyControl={reversed ? firstArmyControl : secondArmyControl} />}
      attackerBuffs={<CombatBuffControls side="Attacker" combatant={attacker} opponent={defender} />}
      defenderBuffs={<CombatBuffControls side="Defender" combatant={defender} opponent={attacker} />}
    />
  )
}
