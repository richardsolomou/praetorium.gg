import { routeSlug } from './slug'

export function canonicalDetachmentName(name: string) {
  switch (routeSlug(name)) {
    // BSData Library - Tyranids.json@b8667d4 names 0a59-1d64-257c-04fb in the singular; Game Datacards 11th/gdc/gsc.json@ebcd0cb in the plural.
    case 'brood-brother-auxilia':
      return 'Brood Brothers Auxilia'
    // BSData Imperium - Space Marines.json@b8667d4 marks 5eb6-4ed2-6aca-c7f1 unfinished; Game Datacards space_marines.json@ebcd0cb and MFM omit the suffix.
    case 'deathwatch-support-its-not-ready':
      return 'Deathwatch Support'
    default:
      return name
  }
}
