import type { CombatAttack } from '../../../core/combatScenario'
import { attachedProfilePrefix } from '../../../core/combatScenario'

export type PreferenceMember = { identity: string; pickIndex: number; profileIds: readonly string[] }
export type StoredWeaponPreferences = Record<string, { profileIds: readonly string[]; choices: Record<string, string> }>

export function storeWeaponPreferences(
  previous: StoredWeaponPreferences,
  members: readonly PreferenceMember[],
  preferences: Readonly<Record<string, string>>,
): StoredWeaponPreferences {
  const stored = { ...previous }
  members.forEach((member, ordinal) => {
    const prefix = ordinal ? attachedProfilePrefix(ordinal) : ''
    const profilePrefix = ordinal ? attachedProfilePrefix(member.pickIndex) : ''
    const profileIds = member.profileIds.map((id) => (profilePrefix && id.startsWith(profilePrefix) ? id.slice(profilePrefix.length) : id))
    const choices = Object.fromEntries(
      Object.entries(preferences)
        .filter(([key]) => (prefix ? key.startsWith(prefix) : !key.startsWith('attached:')))
        .map(([key, value]) => {
          let local = key.slice(prefix.length)
          member.profileIds.forEach((id, index) => {
            local = local.replaceAll(`:${id}:`, `:${profileIds[index]}:`)
          })
          const profile = member.profileIds.indexOf(value)
          return [local, profile < 0 ? value : profileIds[profile]!]
        }),
    )
    stored[member.identity] = { profileIds, choices }
  })
  return JSON.stringify(stored) === JSON.stringify(previous) ? previous : stored
}

export function restoreWeaponPreferences(
  stored: StoredWeaponPreferences,
  members: readonly PreferenceMember[],
  validateProfiles = true,
): Record<string, string> {
  return Object.fromEntries(
    members.flatMap((member, ordinal) => {
      const previous = stored[member.identity]
      if (!previous) return []
      const prefix = ordinal ? attachedProfilePrefix(ordinal) : ''
      const profilePrefix = ordinal ? attachedProfilePrefix(member.pickIndex) : ''
      const currentIds = new Set(
        member.profileIds.map((id) => (profilePrefix && id.startsWith(profilePrefix) ? id.slice(profilePrefix.length) : id)),
      )
      const removed = validateProfiles ? previous.profileIds.filter((id) => !currentIds.has(id)) : []
      return Object.entries(previous.choices)
        .filter(([key, value]) => !removed.some((id) => value === id || key.includes(`:${id}:`)))
        .map(([key, value]) => {
          let projected = key
          previous.profileIds.forEach((id) => {
            projected = projected.replaceAll(`:${id}:`, `:${profilePrefix}${id}:`)
          })
          return [`${prefix}${projected}`, previous.profileIds.includes(value) ? `${profilePrefix}${value}` : value]
        })
    }),
  )
}

export function invalidWeaponChoices(preferences: Readonly<Record<string, string>>, choices: CombatAttack['plan']['choices']): string[] {
  return choices
    .filter((choice) => preferences[choice.key] !== undefined && !choice.options.some((option) => option.value === preferences[choice.key]))
    .map((choice) => choice.key)
}
