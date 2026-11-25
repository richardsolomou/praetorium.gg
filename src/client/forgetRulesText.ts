import { writeStoredValue } from './storedValue'

/**
 * Devices that loaded rules text from community sources before Praetorium showed only its summaries kept the
 * sources they chose and a cache of the files; nothing reads either any more, so both go.
 */
export function forgetRulesTextSources() {
  writeStoredValue('praetorium-text-sources', null)
  if (typeof caches !== 'undefined') void caches.delete('praetorium-rules-text-v1').catch(() => {})
}
