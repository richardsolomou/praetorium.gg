import type { TextPointer } from '../core/sourceText'

export const REFERENCE_KINDS = ['datasheet', 'deployment', 'detachment', 'disposition', 'mission', 'rule', 'terrain'] as const
export type ReferenceKind = (typeof REFERENCE_KINDS)[number]

/** The anchor prefix of a force disposition's primary missions in one pack, which a pack filter finds it by. */
export const DISPOSITION_PACK_SECTION = 'missions-'

export type ReferenceSection = {
  id: string
  title: string
  text: string
  url: string
  /** Where the rules text this section withholds lives upstream, for an agent that needs the wording. */
  textSources?: TextPointer[]
}

export type ReferenceDocument = {
  id: string
  kind: ReferenceKind
  title: string
  faction: string | null
  url: string
  sections: ReferenceSection[]
  revisions: Record<string, string>
  attribution: string[]
}

export type ReferenceSearchResult = {
  id: string
  kind: ReferenceKind
  title: string
  faction: string | null
  url: string
  section: Pick<ReferenceSection, 'id' | 'title' | 'url' | 'textSources'>
  excerpt: string
  revisions: Record<string, string>
  attribution: string[]
}

export type ReferenceSearchResponse = {
  query: string
  results: ReferenceSearchResult[]
  revisions: Record<string, string>
  nextCursor: string | null
}
