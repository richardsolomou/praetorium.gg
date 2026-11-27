import type { VsPick } from './roster'
import type { DefinitionKind, VsDataDefinitions } from './vsDataConstruction'

type Ref = { kind: DefinitionKind; id: string }

/** Every VS Data reference a pick of `unit` holds, as VS Data's `rosterRefs` lists a saved roster unit's. */
export function vsPickRefs(unit: string, vs: VsPick): Ref[] {
  return [
    { kind: 'unit', id: unit },
    ...Object.keys(vs.models).map((id) => ({ kind: 'model' as const, id })),
    ...Object.entries(vs.options).flatMap(([id, counts]) => [
      { kind: 'roster-option' as const, id },
      ...Object.keys(counts).map((wargear) => ({ kind: 'wargear' as const, id: wargear })),
    ]),
    ...(vs.enhancement ? [{ kind: 'enhancement' as const, id: vs.enhancement }] : []),
    ...(vs.warlord ? [{ kind: 'model' as const, id: vs.warlord }] : []),
    ...(vs.allegiance ? [{ kind: 'allegiance' as const, id: vs.allegiance }] : []),
  ]
}

/**
 * The references a rules version does not hold as current, as VS Data's `checkUpgrade` finds them. Its definitions keep
 * current records only, so an aliased, retired or absent ID is a finding too, which a reader acts on by letting the pick go.
 */
export function vsUpgradeFindings(definitions: VsDataDefinitions, refs: readonly Ref[]): Ref[] {
  return refs.filter((ref) => !definitions.get(ref.kind, ref.id) || (ref.kind === 'unit' && definitions.unavailable.has(ref.id)))
}

/**
 * A pick's `vs` as `unit` reads it in a rules version: kept where VS Data finds nothing to act on and its models and
 * options are the unit's own, else none, so the pick reads as its catalogue choices, as one saved before VS Data did.
 */
export function vsPickIn(definitions: VsDataDefinitions, unit: string, vs: VsPick): VsPick | undefined {
  if (vsUpgradeFindings(definitions, vsPickRefs(unit, vs)).length) return undefined
  const owned = (id: string) => definitions.get('model', id)?.data.unit === unit || definitions.get('roster-option', id)?.data.unit === unit
  const own = [...Object.keys(vs.models), ...Object.keys(vs.options), ...(vs.warlord ? [vs.warlord] : [])].every(owned)
  return own ? vs : undefined
}
