import { routeSlug } from './slug'

export function canonicalDetachmentName(name: string) {
  return routeSlug(name) === 'brood-brother-auxilia' ? 'Brood Brothers Auxilia' : name
}
