import { diceExpression, type CombatInput } from './combat'
import type { CombatRule, CombatRuleChoice } from './combatRules'

type MortalWounds = NonNullable<CombatInput['mortalWounds']>[number]

function outcomes(text: string): MortalWounds['outcomes'] | null {
  const result: MortalWounds['outcomes'] = []
  for (const clause of text.replace(/\.$/, '').split(/;\s*/)) {
    const match =
      /^(?:on a|for each) ([1-6])(?:(-)([1-6])|(\+))?, (?:that|that enemy|the target) unit suffers (\d*D[36](?:\+\d+)?|\d+) mortal wounds?$/i.exec(
        clause,
      )
    const damage = match && diceExpression(match[5]!)
    if (!match || !damage) return null
    const min = Number(match[1]),
      max = match[4] ? 6 : Number(match[3] ?? match[1])
    if (min > max || result.some((previous) => min <= previous.max && max >= previous.min)) return null
    result.push({ min, max, damage })
  }
  return result
}

export function compileMortalRule(text: string, rule: CombatRule): CombatRuleChoice[] | null {
  const charge =
    /^Each time (?:this model|this unit) ends a Charge move, (?:you can )?select one enemy unit within Engagement Range of (?:this model|this unit|it)(?: and|, then) roll one D6( for each model in this unit)?: (.+)$/i.exec(
      text,
    )
  const shooting =
    /^(?:Once per battle, )?at the start of your Shooting phase, (?:you can )?select one enemy (?:([A-Z ']+) )?unit within (\d+)" of (?:and visible to )?(?:this model|the bearer) and roll one D6: (.+)$/i.exec(
      text,
    )
  const fight =
    /^(?:Each time this model's unit is selected to fight|At the start of the Fight phase), (?:you can )?select one enemy unit within Engagement Range of (?:this model's unit|this model|this unit|it) and roll one D6: (.+)$/i.exec(
      text,
    )
  const arcing =
    /^In your Shooting phase, each time you select a target for this model's (.+?), roll one D6 for the target unit and one D6 for (?:each|every) other enemy unit within (\d+)" of the target unit\. On a ([2-6])\+, the unit being rolled for is struck by (.+?); after resolving all of this model's attacks against the target unit, each unit struck by \4 suffers (\d*D[36](?:\+\d+)?|\d+) mortal wounds\.?$/i.exec(
      text,
    )
  if (!charge && !shooting && !fight && !arcing) return null
  const written = charge?.[2] ?? shooting?.[3] ?? fight?.[1] ?? `on a ${arcing![3]}+, that unit suffers ${arcing![5]} mortal wounds`
  const result = outcomes(written.replace(/ and this model regains up to that many lost wounds\.?$/i, '.'))
  if (!result) return null
  return [
    {
      label: charge
        ? 'Charged this turn · Target in Engagement Range'
        : fight
          ? 'Target in Engagement Range'
          : shooting
            ? `Target within ${shooting[2]}"`
            : 'Against the selected target',
      effects: [
        {
          role: 'attacker',
          phases: charge || fight ? ['melee'] : ['ranged'],
          ...(shooting?.[1] ? { targetKeywords: shooting[1].split(/ or |,\s*|\//i) } : {}),
          ...(arcing ? { weapon: arcing[1] } : {}),
          mortalWounds: {
            timing: arcing ? 'after' : 'before',
            rolls: 1,
            ...(charge?.[1] ? { perModel: true } : {}),
            outcomes: result,
            ...(/\(Psychic\)/i.test(rule.name) ? { psychic: true } : {}),
          },
        },
      ],
    },
  ]
}
