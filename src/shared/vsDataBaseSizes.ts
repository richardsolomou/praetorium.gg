import type { LoadedCatalogue } from './catalogueIndex'
import type { VsDataBaseSize, VsDataSingleBase, VsDataSummariesFile, VsDataUnit } from './vsData'

type Plain = Exclude<VsDataSingleBase, { alternatives: unknown }>

const FLYING_BASES = { large: 'Large Flying Base (Ø60mm)', small: 'Small Flying Base (Ø32mm)' } as const

function plainText(size: Plain): string {
  if (size === 'hull') return 'Hull'
  if (size === 'unique') return 'Unique'
  if ('flyingBase' in size) return FLYING_BASES[size.flyingBase]
  const about = size.approximate ? '~' : ''
  const flying = size.flying ? ' flying base' : ''
  return 'diameter' in size ? `${about}${size.diameter}mm${flying}` : `${about}${size.length}x${size.width}mm Oval Base${flying}`
}

const singleText = (size: VsDataSingleBase) =>
  typeof size === 'object' && 'alternatives' in size ? size.alternatives.map(plainText).join(', ') : plainText(size)

/** Models or wargear as a line names them, each once, as several E-COGs are one. */
const named = (names: readonly string[]) => [...new Set(names)].join(', ')

/** A base's lines, each labelled with what takes it where the line is not the whole unit's. */
function lines(size: VsDataBaseSize, label: string | null): [string | null, string][] {
  if (typeof size === 'object' && 'byModel' in size) return size.byModel.flatMap((part) => lines(part.size, named(part.models)))
  if (typeof size === 'object' && 'withWargear' in size)
    return [
      [label, singleText(size.size)],
      ...size.withWargear.map((part): [string, string] => [
        label ? `${label} with ${named(part.wargear)}` : named(part.wargear),
        singleText(part.size),
      ]),
    ]
  return [[label, singleText(size)]]
}

/**
 * The base size a datasheet shows for a unit, from VS Data: one line where every model shares it, else a line for
 * each of its models or wargear, as `Model: 32mm`. Null where VS Data gives the unit no base or leaves any of its
 * stat lines without one, as no official source prints most Warhammer Legends bases.
 */
export function baseSizeText(bases: VsDataUnit['bases']): string | null {
  if (!bases?.length || bases.some((base) => base.size === null)) return null
  const shown = bases.flatMap((base) => lines(base.size!, base.models ? named(base.models) : null))
  // Models whose stat lines differ but whose bases do not, as an Exarch and the Aspect Warriors it leads, share one line.
  if (new Set(shown.map(([, text]) => text)).size === 1) return shown[0]![1]
  return shown.map(([label, text]) => (label ? `${label}: ${text}` : text)).join('\n')
}

/** Each unit's base size text from a compacted release, by the BSData entry ids VS Data aliases the unit by. */
export function baseSizesByEntry(release: Pick<VsDataSummariesFile, 'units' | 'entries'>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(release.units).flatMap(([id, unit]) => {
      const text = baseSizeText(unit.bases)
      return text
        ? (release.entries[`unit:${id}`] ?? []).flatMap((alias) =>
            alias.startsWith('bsdata.') ? [[alias.slice('bsdata.'.length).replaceAll('.', '-'), text] as const] : [],
          )
        : []
    }),
  )
}

/** The base size a datasheet shows: VS Data's for its unit, or null where VS Data gives it none. */
export const baseSizeOf = (loaded: Pick<LoadedCatalogue, 'baseSizes'>, entryId: string) => loaded.baseSizes?.[entryId] ?? null
