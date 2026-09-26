import { expect, it, vi } from 'vitest'
import { closedPreviewNumbers, d1DatabaseId, deletePreviewWorker, previewConfig, previewNames, previewNumber } from './cloudflarePreview'

it('deletes a preview worker through the scoped Scripts API', async () => {
  const request = vi.fn<typeof fetch>()
  request.mockResolvedValueOnce(new Response(null, { status: 200 })).mockResolvedValueOnce(new Response(null, { status: 200 }))
  await deletePreviewWorker('account', 'praetorium-pr-606', 'token', request)
  expect(request).toHaveBeenNthCalledWith(
    2,
    'https://api.cloudflare.com/client/v4/accounts/account/workers/scripts/praetorium-pr-606?force=true',
    expect.objectContaining({ method: 'DELETE', headers: { authorization: 'Bearer token' } }),
  )
})

it('skips worker deletion when a previous cleanup already removed it', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 }))
  await deletePreviewWorker('account', 'praetorium-pr-606', 'token', request)
  expect(request).toHaveBeenCalledTimes(1)
})

it('reports a failed worker deletion before deleting preview data', async () => {
  const request = vi.fn<typeof fetch>()
  request.mockResolvedValueOnce(new Response(null, { status: 200 })).mockResolvedValueOnce(new Response(null, { status: 403 }))
  await expect(deletePreviewWorker('account', 'praetorium-pr-606', 'token', request)).rejects.toThrow(
    'Cloudflare Worker delete failed with HTTP 403',
  )
})

it('derives isolated preview resource names from the PR number', () => {
  expect(previewNames(previewNumber('606'))).toEqual({
    worker: 'praetorium-pr-606',
    auth: 'praetorium-auth-pr-606',
    product: 'praetorium-pr-606',
    audience: 'praetorium-pr-606',
    origin: 'https://pr-606.praetorium.gg',
  })
})

it('rejects resource names that could target staging or production', () => {
  expect(() => previewNumber('0')).toThrow('Invalid preview number')
  expect(() => previewNumber('606/../staging')).toThrow('Invalid preview number')
  expect(() => previewNames(100_000_000)).toThrow('Invalid preview number')
})

it('binds the matching D1 database and product audience to one worker', () => {
  const config = previewConfig({
    number: 606,
    main: '/tmp/worker.js',
    assets: '/tmp/assets',
    accountId: '149ad7c463f2ec95a4b1878f990f6532',
    databaseId: 'a776d5fd-d22a-4683-8dbf-e2b36a023f47',
    snapshotId: 'a'.repeat(64),
    manifestSha256: 'b'.repeat(64),
    revision: 'c'.repeat(40),
  })
  expect(config).toMatchObject({
    name: 'praetorium-pr-606',
    vars: {
      SPACETIME_DATABASE: 'praetorium-pr-606',
      SPACETIME_AUDIENCE: 'praetorium-pr-606',
      GITHUB_SHA: 'c'.repeat(40),
    },
    d1_databases: [{ database_name: 'praetorium-auth-pr-606', remote: true }],
    assets: { directory: '/tmp/assets', run_worker_first: ['/_catalogue/*'] },
  })
})

it('rejects a relative preview artifact path', () => {
  expect(() =>
    previewConfig({
      number: 606,
      main: 'worker.js',
      assets: '/tmp/assets',
      accountId: '149ad7c463f2ec95a4b1878f990f6532',
      databaseId: 'a776d5fd-d22a-4683-8dbf-e2b36a023f47',
      snapshotId: 'a'.repeat(64),
      manifestSha256: 'b'.repeat(64),
      revision: 'c'.repeat(40),
    }),
  ).toThrow('Invalid preview artifact')
})

it('rejects a preview revision that cannot identify the deployed commit', () => {
  expect(() =>
    previewConfig({
      number: 606,
      main: '/tmp/worker.js',
      assets: '/tmp/assets',
      accountId: '149ad7c463f2ec95a4b1878f990f6532',
      databaseId: 'a776d5fd-d22a-4683-8dbf-e2b36a023f47',
      snapshotId: 'a'.repeat(64),
      manifestSha256: 'b'.repeat(64),
      revision: 'not-a-sha',
    }),
  ).toThrow('Invalid preview revision')
})

it('selects only the matching D1 database and prunes only closed preview names', () => {
  const list = [
    { name: 'praetorium-auth-staging', uuid: 'a776d5fd-d22a-4683-8dbf-e2b36a023f47' },
    { name: 'praetorium-auth-pr-606', uuid: '00000000-0000-0000-0000-000000000606' },
    { name: 'praetorium-auth-pr-607', uuid: '00000000-0000-0000-0000-000000000607' },
  ]
  expect(d1DatabaseId(list, 'praetorium-auth-pr-606')).toBe('00000000-0000-0000-0000-000000000606')
  expect(closedPreviewNumbers(list, new Set([607]))).toEqual([606])
})
