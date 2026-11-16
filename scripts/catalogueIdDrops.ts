/**
 * `tsx scripts/catalogueIdDrops.ts <previous-catalogue> <next-catalogue> [--accept <reason>]` checks the saved IDs
 * the next catalogue drops, as a catalogue publish and the live refresh do. With `--accept`, it records every
 * unhandled one in `catalogue/accepted-id-drops.json` instead: run it only for IDs the roster audit shows no saved
 * roster holds.
 */
import fs from 'node:fs'
import { parseArgs } from 'node:util'
import { loadCatalogueHistory } from '../src/server/catalogueHistory'
import { acceptedKey, acceptedSchema, catalogueIdDrops, checkIdDrops, failsCheck } from './lib/catalogueIdDrops'

const {
  values: { accept },
  positionals: [previous, next, ...rest],
} = parseArgs({ allowPositionals: true, options: { accept: { type: 'string' } } })
if (!previous || !next || rest.length)
  throw new Error('Usage: catalogueIdDrops.ts <previous-catalogue> <next-catalogue> [--accept <reason>]')
const history = loadCatalogueHistory(next) ?? []
if (accept === undefined) checkIdDrops(previous, next, history)
else {
  if (!accept.trim()) throw new Error('--accept needs the reason these IDs are safe to drop')
  const file = 'catalogue/accepted-id-drops.json'
  const held = acceptedSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8')))
  const known = new Set(held.map(acceptedKey))
  const added = new Map(
    catalogueIdDrops(previous, next, history)
      .filter(failsCheck)
      .map(({ kind, id, name }) => [acceptedKey({ kind, id }), { kind, id, name, reason: accept }] as const)
      .filter(([key]) => !known.has(key)),
  )
  fs.writeFileSync(file, `${JSON.stringify([...held, ...added.values()], null, 2)}\n`)
  console.log(`Accepted ${added.size} dropped IDs in ${file}`)
}
