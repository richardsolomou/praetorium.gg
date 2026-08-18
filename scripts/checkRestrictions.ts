import fs from 'node:fs'
import path from 'node:path'
import { factionRestrictionCoverageIssues, loadWahapediaDescriptions } from '../src/server/wahapedia'

const directory = process.env.CATALOGUE_DIR ?? path.join(import.meta.dirname, '..', 'catalogue-data')
const descriptions = loadWahapediaDescriptions(path.join(directory, 'wahapedia'))
if (!descriptions) throw new Error('Wahapedia descriptions are unavailable')

const issues = factionRestrictionCoverageIssues(descriptions.abilities)
console.log(`\n## named faction restrictions not captured (${issues.length})`)
for (const issue of issues) console.log(`  ${issue}`)

const modifierIssues: string[] = []
let errorModifiers = 0
const visit = (value: unknown, file: string) => {
  if (Array.isArray(value)) {
    value.forEach((child) => visit(child, file))
    return
  }
  if (!value || typeof value !== 'object') return
  const record = value as Record<string, unknown>
  if (Array.isArray(record.modifiers)) {
    for (const modifier of record.modifiers) {
      if (!modifier || typeof modifier !== 'object' || !('field' in modifier) || modifier.field !== 'error') continue
      errorModifiers++
      if (!('type' in modifier) || modifier.type !== 'add' || !('value' in modifier) || typeof modifier.value !== 'string') {
        modifierIssues.push(file)
      }
    }
  }
  Object.values(record).forEach((child) => visit(child, file))
}
const definitions = path.join(directory, 'definitions')
for (const file of fs.readdirSync(definitions).filter((name) => name.endsWith('.json'))) {
  visit(JSON.parse(fs.readFileSync(path.join(definitions, file), 'utf8')), file)
}
console.log(`\n## structured catalogue error restrictions (${errorModifiers})`)
for (const file of modifierIssues) console.log(`  unsupported shape in ${file}`)
if (issues.length || modifierIssues.length) process.exitCode = 1
