import { routeSlug } from '../core/slug'
import { compareText } from '../core/text'
import type { AwardTrigger, MissionAward } from '../core/scoring'
import type { MissionSelectionKind } from '../core/missionSelections'
import type { MissionAction, MissionTwist, WhenDrawn } from '../contracts/missions'
import type { Mission, MissionCard } from '../shared/rulesCards'
import { isUnresolved, type VsDataAward, type VsDataMissionPack, type VsDataWindow } from '../shared/vsData'

/**
 * The cards Praetorium tracks a selection for, by their VS Data ID: what each asks a player to record beyond
 * its score. Checked against the card's summary when added; a card changing meaning takes a new ID.
 */
const SELECTIONS: Record<string, MissionSelectionKind> = {
  'chapter-approved-2026-2027.punishment': 'punishment',
  'chapter-approved-2026-2027.burden-of-trust': 'guards',
  'chapter-approved-2026-2027.a-tempting-target': 'tempting-target',
  // Manual tracking; the card's full eligibility contract is unverified.
  'chapter-approved-2026-2027.beacon': 'beacon',
  'chapter-approved-2026-2027.locate-and-deny': 'locate-and-deny',
  // Extract Relic's only action is the Sensor Sweep that removes the opposing Locate and Deny markers.
  'chapter-approved-2026-2027.extract-relic': 'sensor-sweep',
  'chapter-approved-2026-2027.consecrate': 'consecrate',
  'chapter-approved-2026-2027.smoke-and-mirrors': 'decoy',
  'chapter-approved-2026-2027.triangulation': 'triangulate',
  'chapter-approved-2026-2027.gather-intel': 'extract-intel',
  'chapter-approved-2026-2027.vital-link': 'maintain-control',
  'chapter-approved-2026-2027.death-trap': 'booby-trap',
  'chapter-approved-2026-2027.surveil-the-foe': 'surveil',
}

const TURNS = { own: 'your-turn', opponent: 'opponent-turn', any: 'either' } as const

function triggerOf(window: VsDataWindow): AwardTrigger {
  if (window.at === 'battle-end') return { timing: 'end-of-battle', phase: null, playerTurn: null, roundMin: null, roundMax: null }
  const rounds = { roundMin: window.rounds?.from ?? null, roundMax: window.rounds?.to ?? null }
  if (window.at === 'phase-end') return { ...rounds, timing: 'end-of-phase', phase: window.phase, playerTurn: TURNS[window.turn] }
  // An opponent's-turn window that also opens at the battle end is how the pack says "or the end of the battle".
  const timing = window.orBattleEnd && window.turn === 'opponent' ? 'end-of-turn-or-final-round' : 'end-of-turn'
  return { ...rounds, timing, phase: null, playerTurn: TURNS[window.turn] }
}

/**
 * One award per window it can be claimed in, which is how a battle log records a card's payouts. The tiers of an
 * `exclusive` group played the same way are alternatives to each other.
 */
function awardsOf(card: { id: string; awards: readonly VsDataAward[] }, secondary: boolean): MissionAward[] {
  return card.awards.flatMap((award) => {
    const mode = award.modes?.length === 1 ? award.modes[0]! : secondary ? 'standard' : null
    return award.windows.flatMap((window) =>
      isUnresolved(window)
        ? []
        : [
            {
              vp: award.vp,
              per: award.count === 'each' ? 'each' : null,
              max: award.max ?? null,
              mode,
              group: award.exclusive ? `${card.id}:${award.exclusive}:${mode}` : null,
              // Shown as its VS Data summary, by ID.
              id: award.id,
              criteria: null,
              trigger: triggerOf(window),
            },
          ],
    )
  })
}

function whenDrawnOf(rule: VsDataMissionPack['secondaries'][number]['whenDrawn']): WhenDrawn | null {
  if (!rule) return null
  // An untyped rule is one the player judges from the card's summary.
  if (isUnresolved(rule)) return { operation: 'replace', roundMax: null, heldCards: [] }
  return {
    operation: rule.action === 'discard' ? 'replace' : 'redraw',
    roundMax: rule.untilRound ?? null,
    required: rule.required,
    heldCards: rule.ifActive ? [rule.ifActive] : [],
    ...(rule.ifNoEnemy ? { noEnemy: rule.ifNoEnemy } : {}),
  }
}

/**
 * Every card, limit and twist of a VS Data mission pack as the battle rules read them, by VS Data ID: players read
 * each one's summary by that ID. A pairing's dispositions are keyed by their name's slug, which battle logs and
 * detachments use.
 */
export function vsDataMissions(packs: readonly VsDataMissionPack[], actions: readonly { id: string; name: string }[]) {
  const primaries: MissionCard[] = []
  const secondaries: MissionCard[] = []
  const missions = new Map<string, Mission>()
  const missionTwists = new Map<string, MissionTwist[]>()
  const fixedSecondaryCaps = new Map<string, number>()
  const dispositions = new Map<string, string>()
  const actionsOf = (card: string): MissionAction[] => actions.filter(({ id }) => id.startsWith(`${card}.`))
  // A pack without dispositions, as Combat Patrol is, picks its primary by Detachment, which a battle does not record.
  for (const pack of packs.filter((candidate) => candidate.dispositions.length)) {
    const packId = routeSlug(pack.name)
    const cap = (value: (typeof pack.caps)['primary'], field: 'perRound' | 'perBattle') =>
      isUnresolved(value) ? null : (value[field] ?? null)
    const card = (raw: { id: string; name: string; awards: readonly VsDataAward[] }, secondary: boolean) => ({
      key: raw.id,
      name: raw.name,
      awards: awardsOf(raw, secondary),
      actions: actionsOf(raw.id),
      ...(SELECTIONS[raw.id] ? { selection: SELECTIONS[raw.id] } : {}),
    })
    const slugOf = new Map(pack.dispositions.map((disposition) => [disposition.id, routeSlug(disposition.name)]))
    for (const disposition of pack.dispositions) dispositions.set(routeSlug(disposition.name), disposition.name)
    for (const primary of pack.primaries) {
      primaries.push({ ...card(primary, false), whenDrawn: null })
      for (const pairing of primary.pairings) {
        const friendly = slugOf.get(pairing.friendly)
        const opposition = slugOf.get(pairing.opposition)
        if (!friendly || !opposition) continue
        const mission: Mission = {
          id: primary.id,
          name: primary.name,
          roundCap: cap(pack.caps.primary, 'perRound'),
          gameCap: cap(pack.caps.primary, 'perBattle'),
          secondaryRoundCap: cap(pack.caps.secondary, 'perRound'),
          secondaryGameCap: cap(pack.caps.secondary, 'perBattle'),
          source: pack.name,
          packId,
          deploymentIds: pairing.deployments,
        }
        missions.set(`${packId}|${friendly}|${opposition}`, mission)
        if (!missions.has(`${friendly}|${opposition}`)) missions.set(`${friendly}|${opposition}`, mission)
      }
    }
    for (const secondary of pack.secondaries) secondaries.push({ ...card(secondary, true), whenDrawn: whenDrawnOf(secondary.whenDrawn) })
    const twists = pack.twists.map((twist) => ({
      id: twist.id,
      name: twist.name,
      ...(twist.changesPrimary ? { changesPrimary: true } : {}),
    }))
    if (twists.length) missionTwists.set(packId, twists)
    const fixed = cap(pack.caps.fixedSecondaryPerCard, 'perBattle')
    if (fixed) fixedSecondaryCaps.set(packId, fixed)
  }
  const byName = (left: MissionCard, right: MissionCard) => compareText(left.name, right.name)
  return {
    primaries: primaries.sort(byName),
    secondaries: secondaries.sort(byName),
    missions,
    missionTwists,
    fixedSecondaryCaps,
    dispositions,
    dispositionDetails: [...dispositions].map(([id, name]) => ({ id, name, text: null })),
  }
}
