import { Button } from '@/components/ui/button'
import { combatEffectAppliesTo, combatRuleAppliesTo, combatRuleChoices, combatRuleDefault } from '../../../core/combatRules'
import { CombatRuleLabel } from './CombatRuleLabel'
import { Choice, Toggle } from './CombatControls'
import type { Combatant } from './useCombatant'

export function CombatBuffControls({ side, combatant, opponent }: { side: string; combatant: Combatant; opponent: Combatant }) {
  const role = side === 'Attacker' ? 'attacker' : 'defender'
  const opposingKeywords = opponent.sheets.data?.selected?.keywords
  const enhancements = (combatant.unit?.choices ?? []).flatMap((choice) => {
    if (choice.kind !== 'enhancement' && choice.kind !== 'upgrade') return []
    const options = choice.options.filter(
      (option) =>
        'description' in option &&
        typeof option.description === 'string' &&
        combatRuleAppliesTo(
          {
            id: option.id,
            name: option.name,
            source: choice.name,
            scope: 'unit',
            description: option.description,
            models: combatant.unit?.size.models,
            keywords: combatant.sheets.data?.selected?.keywords,
          },
          role,
          opposingKeywords,
        ),
    )
    return options.length ? [{ ...choice, options }] : []
  })
  const rules = (combatant.sheets.data?.rules ?? []).filter((rule) => combatRuleAppliesTo(rule, role, opposingKeywords))
  return (
    <section aria-label={`${side} buffs`} className="min-w-0">
      <section aria-label={`${side} rules`} className="space-y-3">
        <h3 className="rubric">{side} rules & buffs</h3>
        {enhancements.map((choice) => (
          <div key={choice.key} className="space-y-2">
            <Choice
              label={choice.name}
              ariaLabel={`${side} ${choice.name}`}
              value={choice.options.some((option) => option.id === choice.chosen) ? choice.chosen : ''}
              disabled={!combatant.ready}
              onChange={(id) => combatant.edit.choose(combatant.pickIndex, choice.key, id)}
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
        {rules.map((rule) => {
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
            <div key={rule.id} className="space-y-2 border-t border-edge pt-3">
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
                  <span className="text-xs text-faint">
                    {rule.included || (combatRuleChoices(rule).length && rule.appliedDefences?.length) ? 'Stats applied' : 'Not calculated'}
                  </span>
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
          <p role="alert" className="text-sm text-amber-400">
            Buffs could not load.{' '}
            <Button variant="outline" size="sm" onClick={() => void combatant.sheets.refetch()}>
              Retry
            </Button>
          </p>
        ) : !rules.length && !enhancements.length ? (
          <p className="text-xs text-faint">{combatant.unit ? 'No combat buffs available.' : 'Choose a unit to see its buffs.'}</p>
        ) : null}
      </section>
    </section>
  )
}
