import { routeSlug } from './slug'

export function canonicalDetachmentName(name: string) {
  switch (routeSlug(name)) {
    case 'brood-brother-auxilia':
      return 'Brood Brothers Auxilia'
    case 'deathwatch-support-its-not-ready':
      return 'Deathwatch Support'
    default:
      return name
  }
}
