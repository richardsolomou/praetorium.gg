import path from 'node:path'

export function previewNumber(value: string | undefined) {
  if (!value || !/^[1-9][0-9]{0,7}$/.test(value)) throw new Error('Invalid preview number')
  return Number(value)
}

export function previewNames(number: number) {
  if (!Number.isSafeInteger(number) || number < 1 || number > 99_999_999) throw new Error('Invalid preview number')
  return {
    worker: `praetorium-pr-${number}`,
    auth: `praetorium-auth-pr-${number}`,
    product: `praetorium-pr-${number}`,
    audience: `praetorium-pr-${number}`,
    origin: `https://pr-${number}.praetorium.gg`,
  }
}

export function previewConfig(input: {
  number: number
  main: string
  assets: string
  accountId: string
  databaseId: string
  snapshotId: string
  manifestSha256: string
}) {
  const names = previewNames(input.number)
  if (!path.isAbsolute(input.main) || !path.isAbsolute(input.assets)) throw new Error('Invalid preview artifact')
  if (!/^[0-9a-f]{32}$/.test(input.accountId)) throw new Error('Invalid Cloudflare account ID')
  if (!/^[0-9a-f-]{36}$/.test(input.databaseId)) throw new Error('Invalid D1 database ID')
  if (!/^[0-9a-f]{64}$/.test(input.snapshotId) || !/^[0-9a-f]{64}$/.test(input.manifestSha256)) {
    throw new Error('Invalid Worker catalogue version')
  }
  return {
    name: names.worker,
    main: input.main,
    compatibility_date: '2026-09-17',
    compatibility_flags: ['nodejs_compat'],
    vars: {
      APP_URL: names.origin,
      SPACETIME_AUDIENCE: names.audience,
      SPACETIME_DATABASE: names.product,
      CATALOGUE_SNAPSHOT_ID: input.snapshotId,
      CATALOGUE_MANIFEST_SHA256: input.manifestSha256,
      CLOUDFLARE_ACCOUNT_ID: input.accountId,
    },
    d1_databases: [{ binding: 'AUTH_DB', database_name: names.auth, database_id: input.databaseId, remote: true }],
    assets: { directory: input.assets, binding: 'ASSETS' },
  }
}

export function d1DatabaseId(list: unknown, name: string) {
  if (!Array.isArray(list)) throw new Error('Invalid D1 database list')
  const database = list.find((entry) => entry && typeof entry === 'object' && entry.name === name)
  if (!database) return null
  if (typeof database.uuid !== 'string' || !/^[0-9a-f-]{36}$/.test(database.uuid)) throw new Error('Invalid D1 database ID')
  return database.uuid
}

export function closedPreviewNumbers(list: unknown, open: ReadonlySet<number>) {
  if (!Array.isArray(list)) throw new Error('Invalid D1 database list')
  const numbers = new Set<number>()
  for (const entry of list) {
    if (!entry || typeof entry !== 'object' || typeof entry.name !== 'string') continue
    const match = /^praetorium-auth-pr-([1-9][0-9]{0,7})$/.exec(entry.name)
    if (!match) continue
    const number = previewNumber(match[1])
    if (!open.has(number)) numbers.add(number)
  }
  return [...numbers].sort((a, b) => a - b)
}
