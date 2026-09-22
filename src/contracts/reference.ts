export const REFERENCE_KINDS = ['datasheet', 'detachment', 'mission', 'rule'] as const
export type ReferenceKind = (typeof REFERENCE_KINDS)[number]

export type ReferenceSection = {
  id: string
  title: string
  text: string
  url: string
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
  section: Pick<ReferenceSection, 'id' | 'title' | 'url'>
  excerpt: string
  revisions: Record<string, string>
  attribution: string[]
}

export type ReferenceSearchResponse = {
  query: string
  results: ReferenceSearchResult[]
  revisions: Record<string, string>
}
