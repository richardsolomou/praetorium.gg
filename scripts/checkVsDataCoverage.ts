import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { ruleReferenceMatches, splitWeaponKeywords } from '../src/core/ruleReference'
import { textTokensIn } from '../src/core/sourceText'
import { loadCanonicalCatalogue } from '../src/server/canonicalCatalogue'
import { type VsDataSummaries, vsDataSummariesSteps } from '../src/server/vsDataSummaries'
import { summaryNamedBy } from '../src/shared/ruleSummaries'
import { completeSteps } from '../src/shared/steps'
import { baselineShortfall } from './lib/baselines'
import { catalogueDataDirectory } from './lib/catalogueFiles'

/**
 * How many Game Datacards records of each summarized rules version show a VS Data summary, by kind, and how many of the
 * current catalogue's weapon ability keywords a datasheet's tooltip shows one for. A ratchet: a count may not fall
 * below `catalogue/vs-data-coverage.json`. Add `--write` to raise it, `--details` to list misses.
 */
const baselineFile = path.resolve(import.meta.dirname, '..', 'catalogue', 'vs-data-coverage.json')
const counts = z.record(z.string(), z.record(z.string(), z.number().int()))
const baseline = counts.parse(JSON.parse(fs.readFileSync(baselineFile, 'utf8')))

const directory = catalogueDataDirectory()
const summaries = completeSteps(vsDataSummariesSteps(directory, []))

/**
 * Each weapon ability keyword the current catalogue's datasheets print, parameters dropped, and whether its tooltip
 * shows a summary: of the rule text it links to, as the tooltip reads first, or of the ability it names.
 */
function weaponKeywords(read: VsDataSummaries) {
  const shown = new Map<string, boolean>()
  for (const sheet of loadCanonicalCatalogue(directory)?.datasheets ?? [])
    for (const profile of sheet.profiles)
      if (profile.kind === 'ranged-weapon' || profile.kind === 'melee-weapon')
        for (const keyword of profile.values.flatMap((value) => (value.kind === 'keywords' ? splitWeaponKeywords(value.value) : []))) {
          const rule = sheet.keywordRules
            .filter((candidate) => ruleReferenceMatches(keyword, candidate.name))
            .toSorted((left, right) => right.name.length - left.name.length)[0]
          const name = rule?.name ?? keyword
          if (shown.get(name)) continue
          const tokens = rule ? textTokensIn(rule.description) : []
          const ofFile = new Map(tokens.map((token) => [token.file, read.summariesIn(token.file)]))
          const slug = name
            .toLowerCase()
            .replaceAll(/[^a-z0-9]+/g, '-')
            .replaceAll(/^-|-$/g, '')
          shown.set(
            name,
            Boolean(
              (tokens.length && summaryNamedBy(tokens, ofFile)) ||
              read.abilities()[`weapon-ability:${slug}`] ||
              read.abilities()[`core-ability:${slug}`],
            ),
          )
        }
  return shown
}
if (!summaries) {
  baselineShortfall('the snapshot has no VS Data summaries for any of its rules versions')
} else {
  const served: Record<string, Record<string, number>> = {}
  for (const edition of summaries.editions) {
    const joins = summaries.joins(edition)
    const ofEdition: Record<string, number> = (served[edition] = {})
    console.log(`VS Data summaries for ${edition}`)
    for (const kind of new Set(joins.map((join) => join.kind))) {
      const ofKind = joins.filter((join) => join.kind === kind)
      ofEdition[kind] = ofKind.filter((join) => join.served).length
      const named = ofKind.filter((join) => join.named).length
      console.log(`  ${kind}: ${ofEdition[kind]} of ${ofKind.length} served, ${named} named by VS Data`)
    }
    if (process.argv.includes('--details'))
      for (const join of joins.filter((candidate) => !candidate.served))
        console.log(`  ${join.named ? 'no summary' : 'unnamed   '} | ${join.key}`)
  }
  const keywords = weaponKeywords(summaries)
  const unshown = [...keywords].flatMap(([name, found]) => (found ? [] : [name]))
  served[summaries.editions[0]!]!['weapon keyword'] = keywords.size - unshown.length
  console.log(`weapon ability keywords in the catalogue: ${keywords.size - unshown.length} of ${keywords.size} show a summary`)
  for (const name of unshown) console.log(`  no summary | ${name}`)
  if (process.argv.includes('--write')) fs.writeFileSync(baselineFile, `${JSON.stringify(served, null, 2)}\n`)
  for (const [edition, kinds] of Object.entries(baseline))
    for (const [kind, count] of Object.entries(kinds)) {
      const now = served[edition]?.[kind] ?? 0
      if (now < count) baselineShortfall(`VS Data ${edition} ${kind} summaries fell from ${count} to ${now}`)
    }
}
