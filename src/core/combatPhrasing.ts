/**
 * Some community transcriptions shorten printed rules, as in "This unit's melee attacks have +1 AP".
 * The compiler reads the printed phrasing, so each shorthand sentence it recognises is rewritten into
 * that phrasing first; any other sentence is left as it was.
 */
export function printedPhrasing(text: string) {
  return text
    .replace(/can: Re-roll (hit|wound) rolls of 1\. Re-roll (hit|wound) rolls of 1\./gi, 'can re-roll $1 rolls of 1 and $2 rolls of 1.')
    .split(/(?<=\.)\s+/)
    .map((sentence) => offensiveSentence(sentence) ?? chargedSentence(sentence) ?? auraSentence(sentence) ?? sentence)
    .join(' ')
    .replaceAll(/\b(improve|worsen) that (\w[\w ]*? characteristic of that attack)/gi, '$1 the $2')
}

const OFFENSIVE = /^(?:this|the|your) unit['’]s (?:(melee|ranged) )?attacks(?: that target (.+?))? (can|have) (.+?)\.?$/i

function offensiveSentence(sentence: string) {
  const match = OFFENSIVE.exec(sentence)
  if (!match) return null
  const [, kind, target, verb, rest] = match
  const keyword = /^\[([A-Z ]+?\d*)(?:: (non-)?([A-Z/ ]+))?\]$/i.exec(rest!)
  const effect =
    verb!.toLowerCase() === 'can' ? rerollEffect(rest!) : keyword ? 'that attack has the [' + keyword[1] + '] ability' : bonusEffect(rest!)
  if (!effect) return null
  const keywordTarget = keyword?.[3]
    ? keyword[2]
      ? `a unit that is not a ${orKeywords(keyword[3])}`
      : `a ${orKeywords(keyword[3])} unit`
    : null
  if (target && keywordTarget) return null
  const targets = target ? targetPhrase(target) : keywordTarget
  return `Each time a model in this unit makes ${kind ? `a ${kind.toLowerCase()} ` : 'an '}attack${targets ? ` that targets ${targets}` : ''}, ${effect}.`
}

function rerollEffect(rest: string) {
  const ones =
    /^re-roll (hit|wound) rolls(?: and (hit|wound) rolls)? of 1$|^re-roll (hit|wound) rolls of 1 and (hit|wound) rolls of 1$/i.exec(rest)
  if (ones) {
    const rolls = [ones[1] ?? ones[3], ones[2] ?? ones[4]].filter(Boolean) as string[]
    return rolls.map((roll) => `re-roll a ${roll[0]!.toUpperCase()}${roll.slice(1).toLowerCase()} roll of 1`).join(' and ')
  }
  const all = /^re-roll (hit|wound) rolls$/i.exec(rest)
  return all ? `you can re-roll the ${all[1]![0]!.toUpperCase()}${all[1]!.slice(1).toLowerCase()} roll` : null
}

function bonusEffect(rest: string) {
  const roll = /^\+(\d) to (hit|wound) rolls$/i.exec(rest)
  if (roll) return `add ${roll[1]} to the ${roll[2]![0]!.toUpperCase()}${roll[2]!.slice(1).toLowerCase()} roll`
  const ap = /^\+(\d) AP$/i.exec(rest)
  return ap ? `improve the Armour Penetration characteristic of that attack by ${ap[1]}` : null
}

/** "a unit (excluding MONSTER/VEHICLE units)" as printed: "a unit that is not a MONSTER or VEHICLE". */
function targetPhrase(target: string) {
  const excluding = /^an? (?:enemy )?unit \(excluding ([A-Z/ ]+) units\)$/i.exec(target)
  return excluding ? `a unit that is not a ${orKeywords(excluding[1]!)}` : orKeywords(target)
}

const orKeywords = (text: string) => text.replaceAll(/\b([A-Z]+)\/([A-Z]+)\b/g, '$1 or $2')

function chargedSentence(sentence: string) {
  const match = /^If (?:the|this) unit charged this turn: (.+?)\.?$/i.exec(sentence)
  const effect = match && rerollEffect(match[1]!)
  return effect ? `If this unit made a Charge move this turn, each time a model in this unit makes an attack, ${effect}.` : null
}

function auraSentence(sentence: string) {
  const match =
    /^Friendly (.+?) units(?: \(excluding (.+?) units\))? within (\d+)" of this model can((?: ■ Re-roll (?:hit|wound) rolls of 1){1,2})$/i.exec(
      sentence,
    )
  if (!match) return null
  const rolls = [...match[4]!.matchAll(/Re-roll (hit|wound) rolls of 1/gi)].map((roll) => roll[1]!)
  const effect = rerollEffect(`re-roll ${rolls.join(' rolls and ')} rolls of 1`)
  const excluding = match[2] ? ` (excluding ${orKeywords(match[2])} units)` : ''
  return effect
    ? `While a friendly ${match[1]} unit${excluding} is within ${match[3]}" of this model, each time a model in that unit makes an attack, ${effect}.`
    : null
}
