import { expect, it } from 'vitest'
import { closedPreviewNumbers, d1DatabaseId, previewConfig, previewNames, previewNumber } from './cloudflarePreview'

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
    image: `registry.cloudflare.com/149ad7c463f2ec95a4b1878f990f6532/praetorium-pr-606:sha-${'a'.repeat(40)}`,
    databaseId: 'a776d5fd-d22a-4683-8dbf-e2b36a023f47',
  })
  expect([config.name, config.vars.SPACETIME_DATABASE, config.vars.SPACETIME_AUDIENCE, config.d1_databases[0]!.database_name]).toEqual([
    'praetorium-pr-606',
    'praetorium-pr-606',
    'praetorium-pr-606',
    'praetorium-auth-pr-606',
  ])
})

it('rejects an image built for another pull request', () => {
  expect(() =>
    previewConfig({
      number: 606,
      main: '/tmp/worker.js',
      image: `registry.cloudflare.com/149ad7c463f2ec95a4b1878f990f6532/praetorium-pr-607:sha-${'a'.repeat(40)}`,
      databaseId: 'a776d5fd-d22a-4683-8dbf-e2b36a023f47',
    }),
  ).toThrow('Invalid preview artifact')
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
