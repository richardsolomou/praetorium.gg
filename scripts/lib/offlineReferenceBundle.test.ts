import { gunzipSync } from 'node:zlib'
import { expect, it } from 'vitest'
import { encodeReferenceBundle } from './offlineReferenceBundle'
const search = { factions: [], datasheets: [], detachments: [], rules: [], missions: [] }
it('versions and compresses reference content independently of application assets', () => {
  const content = { queries: [{ key: ['rule-section', 'core', 'moving'], data: 'Move six inches' }], search }
  const first = encodeReferenceBundle(content)
  expect(encodeReferenceBundle(content)).toEqual(first)
  expect(JSON.parse(gunzipSync(first.compressed).toString())).toEqual({ version: 1, revision: first.revision, ...content })
  expect(encodeReferenceBundle({ ...content, queries: [{ ...content.queries[0]!, data: 'Move seven inches' }] }).revision).not.toBe(
    first.revision,
  )
})
it('rejects a corpus beyond the saved query limit', () => {
  expect(() =>
    encodeReferenceBundle({ queries: Array.from({ length: 20_001 }, () => ({ key: ['rule-index'], data: [] })), search }),
  ).toThrow('too many entries')
})
