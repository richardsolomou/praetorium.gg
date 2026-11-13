import { combatUnitKeywords } from '../../../core/combatUnit'
import { Button } from '@/components/ui/button'
import {
  type CombatRule,
  combatEffectAppliesTo,
  combatRuleAppliesTo,
  combatRuleChoices,
  combatRuleDefault,
} from '../../../core/combatRules'
import { combatReadingFor } from '../../../core/combatReading'
import type { LoadoutUnit } from '../rosters/builder/loadoutModel'
import { CombatRuleLabel } from './CombatRuleLabel'
import { Choice, Toggle } from './CombatControls'
import type { Combatant } from './useCombatant'
import { Problem } from '../../components/Problem'
import { formatList } from '../../text'
import { SourceTextPrompt } from '../../components/SourceTextPrompt'
import { missingRuleText } from './readableRules'

export function CombatBuffControls({ side, combatant, opponent }: { side: string; combatant: Combatant; opponent: Combatant }) {
  const role = side === 'Attacker' ? 'attacker' : 'defender'
  const opposingKeywords = opponent.snapshot ? combatUnitKeywords(opponent.snapshot) : undefined
  // Leaders join their bodyguard as members, so each member's enhancements are offered, not only the bodyguard's.
  const members = [
    { index: combatant.pickIndex, sheet: combatant.sheets.data?.selected },
    ...(combatant.sheets.data?.companions ?? []).map((member) => ({ index: member.pickIndex, sheet: member.selected })),
  ]
  const enhancements = members.flatMap(({ index, sheet }) => {
    const unit: LoadoutUnit | undefined = combatant.price.data?.units[index]
    if (!unit) return []
    return unit.choices.flatMap((choice) => {
      if (choice.kind !== 'enhancement' && choice.kind !== 'upgrade') return []
      const options = choice.options.filter((option) => {
        if (typeof option.description !== 'string') return false
        const rule: CombatRule = {
          id: option.id,
          name: option.name,
          source: choice.name,
          scope: 'unit',
          description: option.description,
          included: sheet?.profiles.some((profile) => profile.values.some((value) => value.modifiers?.includes(option.name))),
          models: unit.size.models,
          keywords: sheet?.keywords,
        }
        const reading = option.combat === undefined ? null : combatReadingFor(option.combat, rule)
        return combatRuleAppliesTo(reading ? { ...rule, reading } : rule, role, opposingKeywords)
      })
      return options.length
        ? [{ ...choice, options, index, label: index === combatant.pickIndex ? choice.name : `${unit.name} ${choice.name.toLowerCase()}` }]
        : []
    })
  })
  const rules = combatant.allRules.filter((rule) => combatRuleAppliesTo(rule, role, opposingKeywords))
  // Rules compile from their words, so unloaded ones are absent from the list above rather than off.
  const missingText = missingRuleText(combatant.sheets.data)
  return (
    <section aria-label={`${side} buffs`} className="min-w-0">
      <section aria-label={`${side} rules`} className="space-y-3">
        <h3 className="rubric">{side}</h3>
        {combatant.detachmentNames.length ? (
          <p className="text-xs text-dim">
            {combatant.detachmentNames.length > 1 ? 'Detachments' : 'Detachment'} · {formatList(combatant.detachmentNames)}
          </p>
        ) : null}
        {enhancements.map((choice) => (
          <div key={`${choice.index}:${choice.key}`} className="space-y-2">
            <Choice
              label={choice.label}
              ariaLabel={`${side} ${choice.label}`}
              value={choice.options.some((option) => option.id === choice.chosen) ? choice.chosen : ''}
              disabled={!combatant.ready}
              onChange={(id) => combatant.edit.choose(choice.index, choice.key, id)}
              choices={[
                ...(choice.optional
                  ? [
                      [
                        '',
                        choice.chosen && !choice.options.some((option) => option.id === choice.chosen)
                          ? 'No relevant enhancement'
                          : `No ${choice.kind}`,
                      ] as const,
                    ]
                  : []),
                ...choice.options.map((option) => [option.id, option.name] as const),
              ]}
            />
          </div>
        ))}
        {rules.map((rule, position) => {
          const choices = combatRuleChoices(rule)
            .map((choice, index) => ({ ...choice, value: index + 1 }))
            .filter((choice) => choice.effects.some((effect) => combatEffectAppliesTo(effect, role, opposingKeywords)))
          const selected = combatant.ruleSelections[rule.id] ?? combatRuleDefault(rule)
          const labelContent = (
            <CombatRuleLabel
              side={side}
              name={rule.name}
              description={rule.description}
              rules={combatant.sheets.data?.selected?.keywordRules}
            />
          )
          return (
            <div key={rule.id} className={`space-y-2 ${position || enhancements.length ? 'border-t border-edge pt-3' : ''}`}>
              {choices.length === 1 ? (
                <Toggle
                  label={rule.name}
                  labelContent={labelContent}
                  ariaLabel={`${side} ${rule.name}`}
                  checked={selected === choices[0]!.value}
                  onChange={(checked) => combatant.selectRule(rule.id, checked ? choices[0]!.value : 0)}
                />
              ) : choices.length ? (
                <Choice
                  label={rule.name}
                  labelContent={labelContent}
                  ariaLabel={`${side} ${rule.name}`}
                  value={String(selected)}
                  onChange={(value) => combatant.selectRule(rule.id, Number(value))}
                  choices={[['0', 'Off'], ...choices.map((choice) => [String(choice.value), choice.label] as const)]}
                />
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold">{labelContent}</h4>
                  <span className="text-xs text-faint">Stats applied</span>
                </div>
              )}
              <p className="text-xs text-faint">
                {rule.source}
                {choices.length === 1 && choices[0]!.label !== 'Active'
                  ? ` · ${choices[0]!.label}`
                  : rule.scope === 'nearby'
                    ? ' · Check range'
                    : rule.scope === 'attached'
                      ? ' · Attached'
                      : ''}
              </p>
            </div>
          )
        })}
        {combatant.sheets.isError ? (
          <Problem>
            Buffs could not load.{' '}
            <Button variant="outline" size="sm" onClick={() => void combatant.sheets.refetch()}>
              Retry
            </Button>
          </Problem>
        ) : missingText ? (
          <SourceTextPrompt missing={missingText} />
        ) : !rules.length && !enhancements.length ? (
          <p className="text-xs text-faint">{combatant.unit ? 'No combat buffs available.' : 'Choose a unit to see its buffs.'}</p>
        ) : null}
      </section>
    </section>
  )
}
