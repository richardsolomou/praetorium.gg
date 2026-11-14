import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { WeaponProfiles } from '../../components/DatasheetProfiles'
import type { Datasheet } from '../../../contracts/catalogue'
import { diceExpression, type CombatPhase } from '../../../core/combat'
import type { CombatantSnapshot } from '../../../core/combatMatchup'
import type { WeaponAdjustment } from '../../../core/combatAdjustments'
import { adjustedCharacteristic } from '../../../core/combatRules'
import { datasheetCharacteristicKindOf } from '../../../core/datasheetStructure'
import { wargearKey } from '../../../core/wargear'
import { groupBy } from '../../../core/collections'
import { Problem } from '../../components/Problem'
import { Choice, PHASE_TITLES, PhaseIcon } from './CombatControls'
import type { CombatMatchupView } from './matchupModifiers'

export function weaponToggleGroups(entries: readonly { profile: Datasheet['profiles'][number]; count: number }[]) {
  return [
    ...groupBy(
      entries.map(({ profile, count }) => ({ ...profile, count })),
      (profile) => wargearKey(profile.name, true),
    ),
  ]
}

const SHOOTING_PENALTY = '−1 to hit from this shooting type'
const MANUAL_MODIFIERS = 'Manual modifiers'

/** The profile with the hit roll its shooting type leaves it needing, so the card reads what the calculation uses. */
export function withPenalisedHitRoll(profile: Datasheet['profiles'][number], { needed, moved }: { needed: number; moved: boolean }) {
  return {
    ...profile,
    values: profile.values.map((value) => {
      const printed = Number.parseInt(value.value)
      if (datasheetCharacteristicKindOf(value) !== 'ballistic-skill' || needed === printed) return value
      return {
        ...value,
        value: `${needed}+`,
        baseValue: value.baseValue ?? value.value,
        modifiers: [
          ...(value.modifiers ?? []),
          ...(moved ? [SHOOTING_PENALTY] : []),
          ...(needed === printed + Number(moved) ? [] : ['other modifiers']),
        ],
      }
    }),
  }
}

/** The profile with the manual stat modifiers on it, so the card reads what the calculation uses. */
export function withManualModifiers(profile: Datasheet['profiles'][number], adjustment: WeaponAdjustment) {
  // Skill and AP modifiers improve the roll, which lowers the printed number.
  const added: Partial<Record<ReturnType<typeof datasheetCharacteristicKindOf>, number>> = {
    'ballistic-skill': -(adjustment.skill ?? 0),
    'weapon-skill': -(adjustment.skill ?? 0),
    strength: adjustment.strength ?? 0,
    attacks: adjustment.attacks ?? 0,
    'armour-penetration': -(adjustment.ap ?? 0),
    damage: adjustment.damage ?? 0,
  }
  return {
    ...profile,
    values: profile.values.map((value) => {
      const add = added[datasheetCharacteristicKindOf(value)]
      // Like the calculation, a dice value loses at most its bonus.
      const bonus = diceExpression(value.value)?.bonus
      const applied = add && bonus !== undefined && /d/i.test(value.value) ? Math.max(add, -bonus) : add
      const adjusted = applied ? adjustedCharacteristic(value, applied, [MANUAL_MODIFIERS]) : value
      // A modifier the roll's limits swallow leaves the card as printed.
      return adjusted.value === value.value ? value : adjusted
    }),
  }
}

/** One phase's weapon choices and include switches, with what stops it calculating. */
export function PhaseWeapons({
  phase,
  plan,
  hitRolls,
  statAdjustment,
  attacker,
  busy,
  error,
  excluded,
  onRetry,
  onChoose,
  onIncludedChange,
}: {
  phase: CombatPhase
  plan: CombatMatchupView['plans'][CombatPhase]
  hitRolls: ReturnType<CombatMatchupView['hitRolls']>
  /** The manual stat modifiers this phase's weapons get, shown on their cards. */
  statAdjustment: WeaponAdjustment
  attacker: CombatantSnapshot | null
  busy: boolean
  error: string | undefined
  excluded: readonly string[]
  onRetry: () => void
  onChoose: (key: string, value: string) => void
  onIncludedChange: (key: string, included: boolean) => void
}) {
  const title = PHASE_TITLES[phase]
  const penalisedRoll = (id: string) => {
    const roll = hitRolls.get(id)
    const penalised = plan?.used.some(({ profile, weapon }) => profile.id === id && (weapon?.hitModifier ?? 0) < 0)
    return penalised && roll?.needed ? { needed: roll.needed, moved: roll.needed !== roll.withoutPenalty } : null
  }
  return (
    <section aria-label={`${title} results`} aria-busy={busy} className="min-w-0 space-y-2">
      <h2 className="rubric flex items-center gap-2">
        <PhaseIcon phase={phase} className="size-4" />
        {title}
      </h2>
      {!plan?.used.length ? (
        <p className="text-xs text-dim">{attacker ? `No ${title.toLowerCase()} weapons equipped.` : 'Equipped weapons appear here.'}</p>
      ) : null}
      {plan?.errors.map((message) => (
        <p key={message} role="alert" className="mt-2 text-xs text-discarded">
          {message}
        </p>
      ))}
      {error ? (
        <Problem className="mt-2 text-xs">
          {error}{' '}
          <Button size="sm" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        </Problem>
      ) : null}
      <div className="space-y-2">
        {plan?.choices.map((choice) => (
          <Choice
            key={choice.key}
            label={choice.label}
            value={choice.value}
            choices={choice.options.map((option) => [option.value, option.label] as const)}
            onChange={(value) => onChoose(choice.key, value)}
          />
        ))}
        <div className="space-y-1.5">
          {weaponToggleGroups(plan?.used ?? []).map(([key, group]) => {
            const included = !excluded.includes(key)
            return (
              <div key={group[0]!.id} data-weapon-card className="relative min-w-0 rounded-lg border border-edge bg-sunken [&_h3]:pr-10">
                <Switch
                  className="absolute top-2 right-3 z-10 border-edge data-checked:border-primary data-checked:bg-primary data-unchecked:bg-zinc-600 [&_[data-slot=switch-thumb]]:bg-white"
                  aria-label={`Include ${group[0]!.name} in ${title.toLowerCase()} calculation`}
                  checked={included}
                  onCheckedChange={(checked) => onIncludedChange(key, checked)}
                />
                <div className={`min-w-0 ${included ? '' : 'opacity-50'}`}>
                  <WeaponProfiles
                    weapons={group.map((profile) => {
                      const roll = penalisedRoll(profile.id)
                      const adjusted = withManualModifiers(profile, statAdjustment)
                      return roll ? withPenalisedHitRoll(adjusted, roll) : adjusted
                    })}
                    rules={attacker?.sheet.keywordRules ?? []}
                    embedded
                  />
                  {group.some((profile) => penalisedRoll(profile.id)?.moved) ? (
                    <p className="px-3 pb-2 text-xs text-dim">{SHOOTING_PENALTY}</p>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
