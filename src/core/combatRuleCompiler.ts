import type { DatasheetCharacteristicKind } from '../contracts/catalogue'
import type { CombatRule, CombatRuleChoice, CombatRuleEffect } from './combatRules'
import { compileMortalRule } from './combatMortalRules'

type Phase = CombatRuleEffect['phases'][number]
type Clause = { effects: CombatRuleEffect[]; conditions: string[]; instead?: boolean }
type Context = {
  role: CombatRuleEffect['role']
  enemy?: boolean
  phases: Phase[]
  conditions: string[]
  weapon?: string
  targetKeywords?: string[]
  excludedTargetKeywords?: string[]
  condition?: CombatRuleEffect['condition']
  instead?: boolean
}
const normalize = (text: string) =>
  text
    .replaceAll(/<[^>]*>|\*|\^|_/g, '')
    .replaceAll(/[’‘]/g, "'")
    .replaceAll(/[“”]/g, '"')
    .replaceAll(/\p{Pd}/gu, '-')
    .replaceAll(/\bunmodifed\b/gi, 'unmodified')
    .replaceAll(/\breroll\b/gi, 're-roll')
    .replaceAll(/\s+/g, ' ')
    .trim()
const key = (text: string) =>
  normalize(text)
    .replace(/^faction:\s*/i, '')
    .toLowerCase()
const stripEnd = (text: string) => text.replace(/[.;, ]+$/, '').trim()
const phasesOf = (word: string | undefined, fallback: Phase[]): Phase[] =>
  /ranged/i.test(word ?? '') ? ['ranged'] : /melee/i.test(word ?? '') ? ['melee'] : fallback
const characteristic: Record<string, DatasheetCharacteristicKind> = {
  attacks: 'attacks',
  a: 'attacks',
  strength: 'strength',
  s: 'strength',
  'armour penetration': 'armour-penetration',
  ap: 'armour-penetration',
  damage: 'damage',
  d: 'damage',
  'ballistic skill': 'ballistic-skill',
  'weapon skill': 'weapon-skill',
  bs: 'ballistic-skill',
  ws: 'weapon-skill',
}
const nonCombatStat = /^(?:Move|Movement|Leadership|Objective Control|Range|Advance|Charge)(?: rolls?)?$/i
const noDamageKeywords = /^(?:Assault|Hazardous|Precision|Pistol|Close-Quarters)$/i
const weaponKeyword =
  /^(?:Lethal Hits|Devastating Wounds|Ignores Cover|Twin-linked|Lance|Heavy|Torrent|Psychic|Blast(?: [1-9])?|(?:Sustained Hits|Rapid Fire|Melta) [1-9]|Anti-.+ [2-6]\+)$/i
const selfSubject =
  "(?:a model (?:(?:in|from) (?:your|this|that|the bearer's|this model's) unit|with this ability)|models in (?:your|this|that) unit|this model|the bearer|this unit|that unit|that model|a model in any of those selected units)"
const effectStart =
  /^(?:add|subtract|improve|worsen|halve|re-roll|you can (?:re-roll|ignore)|a successful|an unmodified|a successful unmodified|that attack|models in|this model|the bearer|this unit|your unit|ranged weapons|melee weapons|weapons|until |if |each time|on )/i
const offensive = new RegExp(
  `^each time ${selfSubject} makes (?:a (ranged|melee) |an )attack(.*?), (?=${effectStart.source.slice(1)})(.+)$`,
  'i',
)
const defensive =
  /^each time (?:a (ranged|melee) |an )attack (?:targets|is allocated to) (?:a model in )?(?:your unit|this unit|that unit|this model|the bearer|the bearer's unit|models in that unit), (.+)$/i

/** Complete clauses compile together; board conditions become choices, dice conditions stay in the engine. */
export function compileCombatRule(rule: CombatRule): { choices: CombatRuleChoice[]; defaultChoice: number } | null {
  if (rule.description.length > 12_000) return null
  const stances =
    /^(?:Each time a unit with this ability is selected to (shoot|fight), select one of the .+? below\. Until that unit has finished making its attacks, the selected .+? is active for it and it gains the relevant ability\.|At the start of the battle round, you can select one of the .+? below\. Until the end of the battle round, that .+? is active for your army, and all units from your army that have the .+? ability gain the relevant abilities shown below\.)\s*\n([\s\S]+)$/i.exec(
      rule.description,
    )
  if (stances) {
    const sections = stances[2]!
      .trim()
      .split(/(?:^|\n)(?:■ )?([A-Z][A-Z ’'-]+)\n/)
      .filter(Boolean)
    if (!sections.length || sections.length % 2) return null
    const choices: CombatRuleChoice[] = []
    for (let index = 0; index < sections.length; index += 2) {
      const compiled = compileCombatRule({
        ...rule,
        description: sections[index + 1]!,
        phases: stances[1] ? [stances[1].toLowerCase() === 'fight' ? 'melee' : 'ranged'] : rule.phases,
      })
      if (!compiled) return null
      choices.push(
        ...compiled.choices.map((choice) => ({
          ...choice,
          label: sections[index]!.trim() + (choice.label === 'Active' ? '' : ` · ${choice.label}`),
        })),
      )
    }
    return { choices, defaultChoice: 0 }
  }
  const effectSection = /\*\*Effect:\*\*\s*([\s\S]*?)(?=\n\n\*\*|$)/i.exec(rule.description)?.[1] ?? rule.description
  let text = normalize(effectSection.replaceAll(/(?:^|\n)\s*- /g, ' ■ ')).replace(
    /^.+? (?:model|unit) only(?: \(excluding [^)]+\))?\.\s*/i,
    '',
  )
  text = text.replace(/^Certain areas of the battlefield are considered to be within your army's .+?, as follows: ?/i, '')
  if (!text || text.length > 12_000 || /or that enemy unit is the closest eligible target/i.test(text)) return null
  const mortalChoices = compileMortalRule(text, rule)
  if (mortalChoices) return { choices: mortalChoices, defaultChoice: 0 }
  const initial: Context = { role: 'attacker', phases: rule.phases?.length ? rule.phases : ['ranged', 'melee'], conditions: [] }
  const effect = (context: Context, fields: Partial<CombatRuleEffect>): Clause[] | null => {
    if (
      (context.weapon || context.targetKeywords || context.excludedTargetKeywords) &&
      ['feelNoPain', 'psychicFeelNoPain', 'mortalFeelNoPain', 'save', 'invulnerable', 'toughness', 'damageReduction', 'damageDivisor'].some(
        (field) => field in fields,
      )
    )
      return null
    if (context.condition === 'critical-wound' && fields.characteristic?.kind !== 'armour-penetration') return null
    if (
      (context.condition === 'stronger' || context.condition === 'double-strength') &&
      (fields.options?.woundModifier === undefined || Object.keys(fields).length !== 1)
    )
      return null
    return [
      {
        effects: [
          {
            role: context.role,
            phases: context.phases,
            ...(context.weapon ? { weapon: context.weapon } : {}),
            ...(context.targetKeywords ? { targetKeywords: context.targetKeywords } : {}),
            ...(context.excludedTargetKeywords ? { excludedTargetKeywords: context.excludedTargetKeywords } : {}),
            ...(context.condition ? { condition: context.condition } : {}),
            ...fields,
          },
        ],
        conditions: context.conditions,
        ...(context.instead ? { instead: true } : {}),
      },
    ]
  }
  const hasKeywords = (phrase: string): boolean | null => {
    if (!rule.keywords) return null
    const known = rule.keywords.map(key).toSorted((a, b) => b.length - a.length)
    const matches = (part: string) => {
      let rest = key(part)
        .replace(/^(?:friendly|a|an) /, '')
        .replace(/ (?:models?|units?)$/, '')
      for (const held of known)
        rest = rest.replaceAll(new RegExp(`\\b${held.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b`, 'g'), '').trim()
      return !rest
    }
    const excluded = /\(excluding (.+?)\)/i.exec(phrase)
    if (excluded && excluded[1]!.split(/,\s*|\s+and\s+|\s+or\s+/i).some(matches)) return false
    return phrase
      .replace(excluded?.[0] ?? '\0', '')
      .trim()
      .split(/\s+or\s+/i)
      .some(matches)
  }
  const condition = (predicate: string, context: Context): Context | false | null => {
    predicate = stripEnd(predicate).replace(/^(?:if|while|when) /i, '')
    if (/^(?:this model|the bearer) is leading a unit$/i.test(predicate))
      return rule.scope === 'attached' ? context : { ...context, conditions: [...context.conditions, 'While leading a unit'] }
    const keywords = /^(?:your|this|that) unit has the (.+?) keyword$/i.exec(predicate)
    if (keywords) {
      const matches = hasKeywords(keywords[1]!)
      if (matches !== null) return matches ? context : false
    }
    if (
      /^(?:the )?Strength characteristic of (?:that|the) attack is greater than (?:this model's|the|that unit's|this unit's) Toughness(?: characteristic)?(?: of (?:this|that) unit)?$/i.test(
        predicate,
      )
    )
      return { ...context, condition: 'stronger' }
    if (
      /^(?:the )?Strength characteristic of (?:that|the) attack is (?:at least |equal to or )?twice (?:this model's|the|that unit's|this unit's) Toughness(?: characteristic)?(?: of (?:this|that) unit)?$/i.test(
        predicate,
      )
    )
      return { ...context, condition: 'double-strength' }
    if (/^(?:on )?a Critical Wound$/i.test(predicate)) return { ...context, condition: 'critical-wound' }
    if (/critical (?:hit|wound)|unmodified|(?:hit|wound|saving) roll|strength characteristic.*toughness/i.test(predicate)) return null
    if (!predicate || predicate.length > 350 || /\b(?:add|subtract|improve|worsen|halve|inflict)\b/i.test(predicate)) return null
    const doctrine = /^(?:your|this|that) unit is under the effects of (.+)$/i.exec(predicate)
    if (doctrine) predicate = `With ${doctrine[1]}`
    if (/^(?:this|that) unit made a Charge move this turn$/i.test(predicate)) predicate = 'Charged this turn'
    if (/^the target of that attack is an enemy unit within range of an objective marker$/i.test(predicate))
      predicate = 'Target within range of an objective marker'
    return { ...context, conditions: [...context.conditions, predicate[0]!.toUpperCase() + predicate.slice(1)] }
  }
  const recipient = (phrase: string, context: Context): Context | false | null => {
    phrase = phrase.trim()
    if (
      /^(?:models in (?:your|this|that|the bearer's|this model's|the attacking) unit|(?:your|this|that|the bearer's) unit|models in any of those selected units)$/i.test(
        phrase,
      )
    )
      return context
    if (/^(?:this model|the bearer|that model)$/i.test(phrase)) {
      if (rule.scope === 'attached' && rule.models !== 1) return false
      return rule.models === 1 ? context : null
    }
    const restricted = /^(?:friendly )?(.+?) models( \(excluding .+?\))?(?: (?:from your army|in (?:your|this|that) unit))?$/i.exec(phrase)
    if (!restricted) return null
    const match = hasKeywords(restricted[1]! + (restricted[2] ?? ''))
    return match === false ? false : match ? context : { ...context, conditions: [...context.conditions, `For ${restricted[1]} models`] }
  }
  const parse = (written: string, context: Context, depth = 0): Clause[] | null => {
    if (depth > 18) return null
    written = stripEnd(written)
      .replace(/^■\s*/, '')
      .replace(/^((?:While|If|Each time|Until) .+?):\s*[■▪]\s*/i, '$1, ')
      .replace(/ until that enemy unit has attacked$/i, '')
      .replace(/^(?:and |In addition, |Or: )/i, '')
    const again = (next: string, updated = context) => parse(next, updated, depth + 1)
    if (!written) return []
    const phase = /^(?:In|During) (?:your |the )(Shooting|Fight) phase, (.+)$/i.exec(written)
    if (phase) return again(phase[2]!, { ...context, phases: [phase[1]!.toLowerCase() === 'shooting' ? 'ranged' : 'melee'] })
    const once = /^Once per battle, when (?:this unit|the bearer's unit) is selected to (shoot|fight), (until .+)$/i.exec(written)
    if (once)
      return again(once[2]!, {
        ...context,
        phases: [once[1]!.toLowerCase() === 'shoot' ? 'ranged' : 'melee'],
        conditions: [...context.conditions, 'Ability activated'],
      })
    const selectedEnemyTest =
      /^Once per turn, at the start of your opponent's (Shooting|Fight) phase, select one enemy (.+?) unit visible to (?:this model|the bearer)\. That unit must take a Leadership test\. (Until .+)$/i.exec(
        written,
      )
    if (selectedEnemyTest)
      return again(selectedEnemyTest[3]!, {
        ...context,
        role: 'defender',
        enemy: true,
        phases: [selectedEnemyTest[1]!.toLowerCase() === 'shooting' ? 'ranged' : 'melee'],
        targetKeywords: selectedEnemyTest[2]!.split(/ or |,\s*/i),
        conditions: [...context.conditions, 'Selected visible attacker'],
      })
    const objective = /^Select one objective marker within (\d+)" of (?:your .+? model|this model|the bearer)\. (Until .+)$/i.exec(written)
    if (objective)
      return again(objective[2]!, {
        ...context,
        conditions: [...context.conditions, `Selected objective within ${objective[1]}" of source`],
      })
    if (
      /^(?:Your deployment zone is always|At the start of any phase, if you control at least half of the objective markers within (?:No Man's Land|your opponent's deployment zone), until the end of that phase, (?:No Man's Land|your opponent's deployment zone) is) within your army's [\w '’-]+$/i.test(
        written,
      )
    )
      return []
    if (
      /^If every model in a unit has this ability, each time a ranged attack targets that unit, that unit has the benefit of cover against that attack(?: \(13\.08\))?$/i.test(
        written,
      )
    )
      return effect({ ...context, role: 'defender', phases: ['ranged'] }, { options: { cover: true } })
    const duration =
      /^Until (?:the end of (?:the phase|the turn|your next .+? phase)|the start of your next .+? phase|the attacking unit has finished making its attacks),? (.+)$/i.exec(
        written,
      )
    if (duration) return again(duration[1]!)
    const obscuringCover =
      /^each time an attack targets either your (.+?) unit, or a unit that is not fully visible to the attacking model because of one or more models in your \1 unit, the target has the benefit of cover against that attack(?: \(13\.08\))?$/i.exec(
        written,
      )
    if (obscuringCover)
      return effect(
        {
          ...context,
          role: 'defender',
          phases: ['ranged'],
          conditions:
            hasKeywords(obscuringCover[1]!) === true ? context.conditions : [...context.conditions, 'Obscured by the source unit'],
        },
        { options: { cover: true } },
      )
    const leading = /^While (this model|the bearer) is leading a unit, (.+)$/i.exec(written)
    if (leading) {
      const next = condition(`${leading[1]} is leading a unit`, context)
      return next ? again(leading[2]!, next) : next === false ? [] : null
    }
    const aura = /^While a friendly (.+?) unit( \(excluding .+?\))? is within (\d+)" of (?:this model|the bearer|this unit), (.+)$/i.exec(
      written,
    )
    if (aura) {
      if (hasKeywords(aura[1]! + (aura[2] ?? '')) === false) return []
      return again(aura[4]!, {
        ...context,
        conditions: rule.scope === 'nearby' ? [...context.conditions, `Within ${aura[3]}"`] : context.conditions,
      })
    }
    const enemyAura = /^While an enemy unit(?: \(excluding (.+?)\))? is within (\d+)" of (?:this model|the bearer|this unit), (.+)$/i.exec(
      written,
    )
    if (enemyAura)
      return again(enemyAura[3]!, {
        ...context,
        role: 'defender',
        enemy: true,
        conditions: [...context.conditions, `Attacker within ${enemyAura[2]}"`],
        ...(enemyAura[1]
          ? { excludedTargetKeywords: enemyAura[1].split(/,\s*| and | or /i).map((value) => value.replace(/s$/i, '')) }
          : {}),
      })
    const conditional = /^(?:If|While) (.+?), (.+)$/i.exec(written)
    if (conditional) {
      const next = condition(conditional[1]!, context)
      return next ? again(conditional[2]!, next) : next === false ? [] : null
    }
    const armyAttack =
      /^each time (?:a model in (?:a |an? )?|an? )(.+?) (model|unit)( \(excluding .+?\))? from your army makes (?:a (ranged|melee) |an )attack(.*?), (.+)$/i.exec(
        written,
      )
    if (armyAttack) {
      const eligible = hasKeywords(armyAttack[1]! + (armyAttack[3] ?? ''))
      if (eligible === false) return []
      return again(`each time this unit makes ${armyAttack[4] ? `a ${armyAttack[4]}` : 'an'} attack${armyAttack[5]}, ${armyAttack[6]}`, {
        ...context,
        conditions: eligible === null ? [...context.conditions, `For ${armyAttack[1]}`] : context.conditions,
      })
    }
    const selectedToAttack =
      /^(?:In your (?:Shooting|Fight) phase, )?(?:when|each time) (?:this unit|a (?:friendly )?(.+?) unit(?: from your army)?) is selected to (shoot|fight), (.+)$/i.exec(
        written,
      )
    if (selectedToAttack) {
      if (selectedToAttack[1] && hasKeywords(selectedToAttack[1]) === false) return []
      return again(selectedToAttack[3]!, { ...context, phases: [selectedToAttack[2]!.toLowerCase() === 'shoot' ? 'ranged' : 'melee'] })
    }
    const attack = offensive.exec(written)
    if (attack) {
      let next: Context = { ...context, role: context.enemy ? 'defender' : 'attacker', phases: phasesOf(attack[1], context.phases) }
      let qualifier = attack[2]!.trim().replace(/^that targets an enemy unit$/i, '')
      const weapon = /^with (?:an? |its )?(.+?)(?= that targets| against|$)/i.exec(qualifier)
      if (weapon) {
        next = { ...next, weapon: weapon[1] }
        qualifier = qualifier.slice(weapon[0].length).trim()
      }
      if (qualifier) {
        const target = /^(?:that targets|against) (?:an? |the )?(.+?) (?:unit|model)$/i.exec(qualifier)
        if (target && !/enemy|closest|below|within|that|this|your|selected/i.test(target[1]!))
          next = { ...next, targetKeywords: target[1]!.split(/ or |,\s*|\//i) }
        else {
          const checked = condition(qualifier.replace(/^that targets /i, 'Target is '), next)
          if (!checked) return checked === false ? [] : null
          next = checked
        }
      }
      return again(attack[3]!, next)
    }
    const incoming = defensive.exec(written)
    if (incoming && /(?:targets|allocated to) (?:this model|the bearer),/i.test(written) && rule.models !== 1)
      return rule.scope === 'attached' ? [] : null
    if (incoming) return again(incoming[2]!, { ...context, role: 'defender', phases: phasesOf(incoming[1], context.phases) })
    const damageState = /^While this model has (\d+)-(\d+) wounds remaining, (.+)$/i.exec(written)
    if (damageState)
      return again(damageState[3]!, {
        ...context,
        conditions: [...context.conditions, `${damageState[1]}–${damageState[2]} wounds remaining`],
      })
    const triggered =
      /^(?:Each time (?:this model|this unit|the bearer's unit|this model's unit) (?:ends a Charge move|makes a Charge move|Remains Stationary)|In your Movement phase, if this model Remains Stationary), (.+)$/i.exec(
        written,
      )
    if (triggered)
      return again(triggered[1]!, {
        ...context,
        conditions: [...context.conditions, /Stationary/.test(written) ? 'Remained stationary' : 'Charged this turn'],
      })
    const marked =
      /^(?:(?:In your Shooting phase, )?after (?:this model|this unit) has shot, select one enemy unit hit by one or more of those attacks|In your Command phase, select one enemy unit)\. (.+)$/i.exec(
        written,
      )
    if (marked) return again(marked[1]!, { ...context, conditions: [...context.conditions, 'Against the selected target'] })
    if (/^(?:that unit|that enemy unit|models in that unit) cannot have the Benefit of Cover$/i.test(written))
      return effect({ ...context, phases: ['ranged'] }, { keyword: 'Ignores Cover' })
    const selection =
      /^(?:At the start of (?:the|your|your opponent's) (Shooting|Fight|Command) phase, |In your (Shooting|Command) phase, )?(?:you can )?select (?:one|a) (?:other )?(friendly|enemy) (.+?) unit( \(excluding .+?\))? within (\d+)" of (?:and visible to )?(?:this model|the bearer|the bearer's unit|it)\. (.+)$/i.exec(
        written,
      )
    if (selection) {
      if (selection[3]!.toLowerCase() === 'friendly' && hasKeywords(selection[4]! + (selection[5] ?? '')) === false) return []
      return again(selection[7]!, {
        ...context,
        role: selection[3]!.toLowerCase() === 'enemy' ? 'defender' : context.role,
        enemy: selection[3]!.toLowerCase() === 'enemy',
        phases: /fight/i.test(selection[1] ?? selection[2] ?? '')
          ? ['melee']
          : /shooting/i.test(selection[1] ?? selection[2] ?? '')
            ? ['ranged']
            : context.phases,
        conditions: [...context.conditions, `Selected target within ${selection[6]}"`],
      })
    }
    const activation =
      /^(?:Once per (?:battle|turn)(?: for each .+? this unit has)?,? )?(?:at the start of the (?:Fight|Shooting) phase|in the (?:Fight|Shooting) phase|when this unit is selected to (?:fight|shoot)), (?:this model can use this ability|you can use this ability)\. If (?:it does|you do), (.+)$/i.exec(
        written,
      )
    if (activation)
      return again(activation[1]!, {
        ...context,
        phases: /Fight|selected to fight/i.test(written.slice(0, written.indexOf('.'))) ? ['melee'] : ['ranged'],
        conditions: [...context.conditions, 'Ability activated'],
      })
    const trigger = /^The first time each turn that (.+?), (?:after that unit has finished resolving its attacks, )?(until .+)$/i.exec(
      written,
    )
    if (trigger) return again(trigger[2]!, { ...context, conditions: [...context.conditions, trigger[1]!] })
    const bullets = written.split(/\s+[■▪]\s+/)
    if (bullets.length > 1) {
      const clauses = bullets.map((bullet) => again(bullet))
      return clauses.some((clause) => clause === null) ? null : clauses.flatMap((clause) => clause!)
    }
    written = written.replace(/(Save characteristic of [2-6]\+) and a Move characteristic of (\d+)"$/i, '$1. A Move characteristic of $2"')
    // Split complete sentences before effect conjunctions, retaining the enclosing recipient and phase.
    const sentences = written.split(/\.\s+(?=[A-Z])/)
    if (sentences.length > 1) {
      const result: Clause[] = []
      for (const sentence of sentences) {
        const previous = result.flatMap((clause) => clause.effects).at(-1)
        const inherited =
          previous && /such weapons|those weapons|those attacks/i.test(sentence)
            ? { ...context, phases: previous.phases, weapon: previous.weapon }
            : context
        const clauses = again(sentence, { ...inherited, instead: /\binstead\b/i.test(sentence) })
        if (!clauses) return null
        result.push(...clauses)
      }
      return result
    }
    const conjunction =
      /^(.+?)(?:,? and |; )((?:if |re-roll |you can re-roll |add |subtract |improve |worsen |each time |those weapons |the bearer |models in |that unit |this unit ).+)$/i.exec(
        written,
      )
    if (conjunction) {
      const first = again(conjunction[1]!)
      const previous = first?.flatMap((clause) => clause.effects).at(-1)
      const inherited =
        previous && /such weapons|those weapons|those attacks/i.test(conjunction[2]!)
          ? { ...context, phases: previous.phases, weapon: previous.weapon }
          : context
      const second = again(conjunction[2]!, { ...inherited, instead: /\binstead\b/i.test(conjunction[2]!) })
      return first && second ? [...first, ...second] : null
    }
    const conditionalTail = /^(.+?)(?:,? and,? )(if .+)$/i.exec(written)
    if (conditionalTail && effectStart.test(conditionalTail[1]!)) {
      const first = again(conditionalTail[1]!),
        second = again(conditionalTail[2]!)
      return first && second ? [...first, ...second] : null
    }
    const trailingCondition = /^(.+?) (if|while) (.+)$/i.exec(written)
    if (trailingCondition && effectStart.test(trailingCondition[1]!)) {
      const checked = condition(trailingCondition[3]!, context)
      return checked ? again(trailingCondition[1]!, checked) : checked === false ? [] : null
    }
    const sharedSubject =
      /^((?:this model|the bearer|models in (?:your|this|that) unit|your unit|this unit|that unit) (?:has|have)) (.+?) and ((?:the )?Feel No Pain [2-6]\+ ability|(?:an? )?[2-6]\+ invulnerable save|(?:a )?Save characteristic of [2-6]\+)$/i.exec(
        written,
      )
    if (sharedSubject) return again(`${sharedSubject[1]} ${sharedSubject[2]}. ${sharedSubject[1]} ${sharedSubject[3]}`)
    written = written.replace(/ (?:as well|instead)$/i, '').replace(/ roll for that attack$/i, ' roll')
    const ignore = /^(?:you can )?(?:also )?ignore any or all modifiers to (?:the following: )?(.+)$/i.exec(written)
    if (ignore) {
      const fields: Partial<CombatRuleEffect> = {}
      for (const part of ignore[1]!.split(/;\s*/)) {
        if (/^(?:that attack's |the )?(?:Ballistic Skill(?: or Weapon Skill)?|Weapon Skill) characteristic$/i.test(part))
          fields.ignoreSkillModifiers = true
        else if (/^(?:the |that attack's )?Hit roll$/i.test(part)) fields.ignoreHitModifiers = true
        else if (/^(?:the |that attack's )?Wound roll$/i.test(part)) fields.ignoreWoundModifiers = true
        else return null
      }
      return effect(context, fields)
    }
    const reroll = /^(?:you can )?re-roll (?:a|the) (Hit|Wound) roll( of 1)?$/i.exec(written)
    if (reroll)
      return effect(context, {
        options: { [reroll[1]!.toLowerCase() === 'hit' ? 'hitReroll' : 'woundReroll']: reroll[2] ? 'ones' : 'failed' },
      })
    if (/^(?:you can )?re-roll (?:a|the) Damage roll of 1$/i.test(written)) return effect(context, { damageReroll: 'ones' })
    const roll = /^(add|subtract) ([1-6]) (?:to|from) (?:the|that attack's) (Hit|Wound) roll$/i.exec(written)
    if (roll)
      return effect(context, {
        options: {
          [roll[3]!.toLowerCase() === 'hit' ? 'hitModifier' : 'woundModifier']:
            Number(roll[2]) * (roll[1]!.toLowerCase() === 'subtract' ? -1 : 1),
        },
      })
    const critical =
      /^(?:a successful |a successful unmodified |an unmodified )?(Hit|Wound) roll of ([2-6])\+ scores a Critical (?:Hit|Wound)$/i.exec(
        written,
      )
    if (critical)
      return effect(context, {
        [critical[1]!.toLowerCase() === 'hit' ? 'criticalHit' : 'criticalWound']: Number(critical[2]),
        ...(/^a successful/i.test(written)
          ? { [critical[1]!.toLowerCase() === 'hit' ? 'criticalHitRequiresSuccess' : 'criticalWoundRequiresSuccess']: true }
          : {}),
      })
    if (/^a successful Hit roll scores a Critical Hit$/i.test(written)) return effect(context, { allHitsCritical: true })
    const criticalCondition = /^on a Critical Wound, (.+)$/i.exec(written)
    if (criticalCondition) return again(criticalCondition[1]!, { ...context, condition: 'critical-wound' })
    const damage =
      /^(?:subtract ([1-9]) from (?:the Damage characteristic of that attack|that attack's Damage characteristic)|halve (?:the Damage characteristic of that attack|the Damage characteristic of that attack \(rounding up\)|that attack's Damage characteristic))$/i.exec(
        written,
      )
    if (damage) return effect({ ...context, role: 'defender' }, damage[1] ? { damageReduction: Number(damage[1]) } : { damageDivisor: 2 })
    const defence =
      /^(this model|the bearer|models in (?:your|this|that|the bearer's) unit|the bearer's unit|your unit|this unit|that unit|it) (?:has|have) (?:the )?(?:Feel No Pain ([2-6])\+(?: ability)?( against (?:mortal wounds and Psychic Attacks|Psychic Attacks and mortal wounds|Psychic Attacks|mortal wounds))?|(?:an? )?([2-6])\+ invulnerable save(?: against (ranged|melee) attacks)?|(?:a )?Save characteristic of ([2-6])\+|(?:the )?(Stealth|Benefit of Cover)(?: ability)?)$/i.exec(
        written,
      )
    if (defence) {
      if (/^(this model|the bearer)$/i.test(defence[1]!) && rule.models !== 1) return rule.scope === 'attached' ? [] : null
      const next = { ...context, role: 'defender' as const, phases: phasesOf(defence[5], context.phases) }
      if (defence[2])
        return effect(
          next,
          defence[3]
            ? {
                ...(/Psychic/i.test(defence[3]) ? { psychicFeelNoPain: Number(defence[2]) } : {}),
                ...(/mortal wounds/i.test(defence[3]) ? { mortalFeelNoPain: Number(defence[2]) } : {}),
              }
            : { feelNoPain: Number(defence[2]) },
        )
      if (defence[4]) return effect(next, { invulnerable: Number(defence[4]) })
      if (defence[6]) return effect(next, { save: Number(defence[6]) })
      return effect({ ...next, phases: ['ranged'] }, { options: { cover: true } })
    }
    const grant =
      /^(?:(ranged |melee )?weapons equipped by (.+?)|(?:this unit's|your unit's|that unit's|its) (ranged |melee )?(?:attacks|weapons)|those weapons|that attack) (?:have|has|gain) (?:the )?(.+?)(?: abilit(?:y|ies))?(?: (?:when|while) targeting (.+))?$/i.exec(
        written,
      )
    if (grant && grant[4]!.includes('[')) {
      const next = grant[2] ? recipient(grant[2], context) : context
      if (!next) return next === false ? [] : null
      const keywords = [...grant[4]!.matchAll(/\[([^\]]+)\]/g)].map((match) => match[1]!)
      if (
        !keywords.length ||
        grant[4]!.replaceAll(/\[[^\]]+\]|[, ]|\band\b/gi, '') ||
        keywords.some((word) => !weaponKeyword.test(word) && !noDamageKeywords.test(word))
      )
        return null
      const target = grant[5]?.replace(/^(?:enemy )?units? (?:in|within) range of /i, 'Target within range of ')
      const checked = target ? condition(target, next) : next
      if (!checked) return checked === false ? [] : null
      if (context.condition) return null
      return keywords
        .filter((word) => !noDamageKeywords.test(word))
        .flatMap((keyword) => effect({ ...checked, phases: phasesOf(grant[1] ?? grant[3], context.phases) }, { keyword }) ?? [])
    }
    const nonCumulative = / \(this is not cumulative with any other modifiers that improve Armour Penetration\)$/i.test(written)
    if (nonCumulative)
      written = written.replace(/ \(this is not cumulative with any other modifiers that improve Armour Penetration\)$/i, '')
    const stat =
      /^(?:(add|subtract) ([1-9])"? (?:to|from)|(?:improve|worsen)) (?:the )?(.+?) characteristics? of (.+?)(?: by ([1-9]))?$/i.exec(
        written,
      )
    if (stat) {
      const names = stat[3]!.split(/,\s*|\s+and\s+/i)
      const amount = Number(stat[2] ?? stat[5])
      if (!amount || names.some((name) => !characteristic[key(name)] && !nonCombatStat.test(name))) return null
      if (nonCumulative && (context.condition || names.some((name) => characteristic[key(name)] !== 'armour-penetration'))) return null
      const weapon = /^(ranged |melee )?weapons equipped by (.+)$/i.exec(stat[4]!)
      const scoped = weapon
        ? recipient(weapon[2]!, context)
        : /^(?:that attack|such weapons|those weapons|the bearer's melee weapons|models in (?:this|that|the bearer's) unit)$/i.test(
              stat[4]!,
            )
          ? context
          : null
      if (!scoped) return scoped === false ? [] : null
      if (
        context.condition &&
        (context.condition !== 'critical-wound' || names.some((name) => characteristic[key(name)] !== 'armour-penetration'))
      )
        return null
      return names.flatMap((name) => {
        const kind = characteristic[key(name)]
        if (!kind) return []
        const negative = kind === 'armour-penetration' || kind === 'ballistic-skill' || kind === 'weapon-skill'
        const subtract = /^(?:subtract|worsen)/i.test(written)
        return (
          effect(
            { ...scoped, phases: phasesOf(weapon?.[1], context.phases) },
            {
              characteristic: {
                kind,
                ...(nonCumulative ? { nonCumulative: true } : {}),
                add:
                  amount *
                  (stat[1] ? (/subtract/i.test(stat[1]) ? -1 : 1) : subtract ? -1 : 1) *
                  (negative && (!stat[1] || kind === 'armour-penetration') ? -1 : 1),
              },
            },
          ) ?? []
        )
      })
    }
    if (nonCumulative) return null
    const stronger =
      /^(ranged |melee )?attacks that target (?:this|your) unit with a S greater than (?:this|your) unit's T have -([1-3]) to wound rolls$/i.exec(
        written,
      )
    if (stronger)
      return effect(
        { ...context, role: 'defender', phases: phasesOf(stronger[1], context.phases), condition: 'stronger' },
        { options: { woundModifier: -Number(stronger[2]) } },
      )
    const namedStat = /^(?:your|this) unit's (.+?) weapons have ([+-][1-9]) (AP|S|A|D)$/i.exec(written)
    if (namedStat)
      return effect(
        { ...context, weapon: namedStat[1] },
        { characteristic: { kind: characteristic[key(namedStat[3]!)]!, add: Number(namedStat[2]) * (namedStat[3] === 'AP' ? -1 : 1) } },
      )
    const directGrant = /^(?:its|the bearer's) (.+?) has the (\[[^\]]+\]) ability$/i.exec(written)
    if (directGrant)
      return again(`weapons equipped by this model have the ${directGrant[2]} ability`, { ...context, weapon: directGrant[1] })
    const simple =
      /^(?:(this|your|that) unit's )?(ranged |melee )?attacks(?: that target (?:this|your) unit)? have ([+-][1-9]) (S|AP|A|D|to hit rolls|to wound rolls)(?: and (AP|S|A|D))?$/i.exec(
        written,
      )
    if (simple) {
      const next = {
        ...context,
        role: /that target/.test(written) ? ('defender' as const) : context.role,
        phases: phasesOf(simple[2], context.phases),
      }
      if (context.condition) return null
      const fields = [simple[4]!, ...(simple[5] ? [simple[5]] : [])]
      return fields.flatMap(
        (field) =>
          effect(
            next,
            /rolls/.test(field)
              ? { options: { [/hit/.test(field) ? 'hitModifier' : 'woundModifier']: Number(simple[3]) } }
              : { characteristic: { kind: characteristic[key(field)]!, add: Number(simple[3]) * (field === 'AP' ? -1 : 1) } },
          ) ?? [],
      )
    }
    const targetedBonus = /^(?:this|your|that) unit's (ranged |melee )?attacks that target (?:an? )?(.+?) unit have (.+)$/i.exec(written)
    if (targetedBonus && !/enemy|within|below|that|this|your/i.test(targetedBonus[2]!))
      return again(`attacks have ${targetedBonus[3]}`, {
        ...context,
        phases: phasesOf(targetedBonus[1], context.phases),
        targetKeywords: targetedBonus[2]!.split(/,\s*| or |\//i),
      })
    const toughness = /^(?:this|your) unit has \+([1-9]) T$/i.exec(written)
    if (toughness) return effect({ ...context, role: 'defender' }, { toughness: Number(toughness[1]) })
    if (
      /^(?:add|subtract) [1-9]"? (?:to|from) (?:the )?(?:Move|Movement|Leadership|Objective Control) characteristic(?: of .+)?$/i.test(
        written,
      )
    )
      return []
    if (/^(?:you can )?re-roll (?:the |a |)(?:Advance|Charge) roll(?:s made for (?:this|that|your) unit)?$/i.test(written)) return []
    if (/^(?:the bearer|this model|this unit) has the [A-Z '-]+ keyword$/i.test(written)) return []
    if (
      /^(?:Friendly .+? units|this unit|that unit) (?:have|has) (?:the )?(?:Deep Strike|Scouts \d+"|Infiltrators|Fights First|Battleline)(?: ability)?$/i.test(
        written,
      )
    )
      return []
    if (
      /^(?:a |(?:the bearer|this model|this unit) has a )?(?:Move|Movement|Leadership|Objective Control|Range) characteristic of \d+["+]?$/i.test(
        written,
      )
    )
      return []
    if (/^(?:subtract|add) [1-9] (?:from|to) (?:its|this model's) Objective Control characteristic$/i.test(written)) return []
    return null
  }
  const opponentDecision =
    /^Each time this model targets an enemy unit with its (.+?), your opponent must declare if that unit will (.+?) or (.+?): [■▪] If it (.+?), when resolving attacks against that unit this phase, (.+?) [■▪] If it (.+?), (until .+)$/i.exec(
      text,
    )
  if (opponentDecision) {
    const attack = parse(opponentDecision[5]!, { ...initial, weapon: opponentDecision[1] })
    const defence = parse(opponentDecision[7]!, { ...initial, role: 'defender', enemy: true })
    if (!attack || !defence || [...attack, ...defence].some((clause) => clause.conditions.length)) return null
    return {
      defaultChoice: 0,
      choices: [
        { label: `Target ${opponentDecision[4]}`, effects: attack.flatMap((clause) => clause.effects) },
        { label: `Attacker ${opponentDecision[6]} after being targeted`, effects: defence.flatMap((clause) => clause.effects) },
      ],
    }
  }
  const statusAura =
    /^While an enemy unit is within (\d+)" of this unit, it is ([^.]+)\. While an enemy unit is \2, each time an attack targets that unit, (.+?)\. At the start of each phase, for each .+? unit from your army, that unit can suffer (\d+) mortal wounds\. If it does, until the end of the phase, the range of that unit's .+? Aura ability is increased to (\d+)"\.?$/i.exec(
      text,
    )
  if (statusAura) {
    const clauses = parse(statusAura[3]!, initial)
    if (!clauses || clauses.some((clause) => clause.conditions.length)) return null
    return {
      defaultChoice: 0,
      choices: [
        {
          label: `Target within ${statusAura[1]}" (${statusAura[5]}" with the extended aura active)`,
          effects: clauses.flatMap((clause) => clause.effects),
        },
      ],
    }
  }
  const alternativeGrants =
    /^(.*?)(this unit's|your unit's|that unit's) (ranged |melee )?attacks have: ■ (\[[^\]]+\])\.? ■ Or: (\[[^\]]+\])\.?$/i.exec(text)
  if (alternativeGrants) {
    const choices: CombatRuleChoice[] = []
    for (const keyword of [alternativeGrants[4]!, alternativeGrants[5]!]) {
      const compiled = compileCombatRule({
        ...rule,
        description: `${alternativeGrants[1]}${alternativeGrants[2]} ${alternativeGrants[3] ?? ''}attacks have the ${keyword} ability.`,
      })
      if (!compiled) return null
      choices.push(
        ...compiled.choices.map((choice) => ({
          ...choice,
          label: keyword.slice(1, -1) + (choice.label === 'Active' ? '' : ` · ${choice.label}`),
        })),
      )
    }
    return { choices, defaultChoice: 0 }
  }
  const abilitySelection =
    /^(.*?)select one of the following abilities: (.+?)\. (Until .+?, (?:ranged |melee )?weapons equipped by .+?) have that ability\.?$/i.exec(
      text,
    )
  if (abilitySelection) {
    const keywords = [...abilitySelection[2]!.matchAll(/\[([^\]]+)\]/g)].map((match) => match[1]!)
    if (!keywords.length || abilitySelection[2]!.replaceAll(/\[[^\]]+\]|[, ]|\band\b/gi, '')) return null
    const choices: CombatRuleChoice[] = []
    for (const keyword of keywords) {
      const compiled = compileCombatRule({
        ...rule,
        description: `${abilitySelection[1]}${abilitySelection[3]} have the [${keyword}] ability.`,
      })
      if (!compiled) return null
      choices.push(
        ...compiled.choices.map((choice) => ({ ...choice, label: keyword + (choice.label === 'Active' ? '' : ` · ${choice.label}`) })),
      )
    }
    return { choices, defaultChoice: 0 }
  }
  // Printed alternatives are mutually exclusive; ordinary bullets are cumulative clauses.
  const alternatives = /^(.*?select one of the following.*?):\s*[■▪-]\s*(.+)$/i.exec(text)
  if (alternatives) {
    const parts = alternatives[2]!.split(/\s*[■▪]\s*/).map((part) => part.replace(/^Or:?\s*/i, ''))
    const choices: CombatRuleChoice[] = []
    for (const part of parts) {
      const clauses = parse(part, {
        ...initial,
        phases: /Fight phase/i.test(alternatives[1]!) ? ['melee'] : /Shooting phase/i.test(alternatives[1]!) ? ['ranged'] : initial.phases,
      })
      if (!clauses) return null
      const effects = clauses.flatMap((clause) => clause.effects)
      if (effects.length) choices.push({ label: part, effects })
    }
    return { choices, defaultChoice: 0 }
  }
  const clauses = parse(text, initial)
  if (!clauses) return null
  const conditions = [...new Set(clauses.flatMap((clause) => clause.conditions))]
  if (conditions.length > 4) return null
  const choices: CombatRuleChoice[] = []
  const effectKey = (value: CombatRuleEffect) =>
    JSON.stringify([
      value.role,
      value.phases,
      value.weapon,
      value.characteristic?.kind,
      Object.keys(value.options ?? {}),
      value.feelNoPain !== undefined ? 'fnp' : undefined,
      value.invulnerable !== undefined ? 'invulnerable' : undefined,
    ])
  for (let mask = 0; mask < 2 ** conditions.length; mask++) {
    const active = conditions.filter((_, index) => mask & (1 << index))
    let effects: CombatRuleEffect[] = []
    for (const clause of clauses) {
      if (!clause.conditions.every((label) => active.includes(label))) continue
      if (clause.instead) effects = effects.filter((previous) => !clause.effects.some((next) => effectKey(next) === effectKey(previous)))
      effects.push(...clause.effects)
    }
    if (!effects.length || choices.some((choice) => JSON.stringify(choice.effects) === JSON.stringify(effects))) continue
    choices.push({ label: active.join(' · ') || 'Active', effects })
  }
  return {
    choices,
    defaultChoice:
      choices[0]?.label === 'Active' && (rule.scope === 'unit' || rule.scope === 'attached' || rule.scope === 'detachment') ? 1 : 0,
  }
}
