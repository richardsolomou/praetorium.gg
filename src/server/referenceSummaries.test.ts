import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import composition from '../../catalogue/composition.json' with { type: 'json' }
import type { CanonicalCatalogue } from '../contracts/catalogue'
import { textToken, withTextPointers } from '../core/sourceText'
import { completeSteps } from '../shared/steps'
import { readCatalogueComposition } from './catalogueComposition'
import { referenceCorpusFor } from './referenceCorpus'
import { detachmentWithSummaries, printedRuleSummary, ruleSummaryFinder } from './referenceSummaries'
import { textFileId, textFilesFrom, textHash, textSourcePaths } from './sourceTexts'
import { vsDataReleaseFiles, writeFiles } from './vsData.fixtures'
import { checkVsDataRelease, compactVsDataRelease } from './vsDataRelease'
import { vsDataSummariesSteps, withholdCopiedSummaries } from './vsDataSummaries'

const when = 'Your Shooting phase.'
const effect = 'Until the end of the phase, each time a model in your unit makes an attack, add 1 to the Hit roll.'
const stratagem = { id: 'f06fa0ef-917a-57c2-955d-325a082d942c', when: { en: when }, effect: { en: effect } }
const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

/** What agents read of a detachment whose Stratagem Game Datacards prints and VS Data summarizes as `summary`. */
function agentAnswer(summary: string) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'reference-summaries-'))
  directories.push(directory)
  const base = composition.editions.filter((entry) => 'base' in entry && entry.base)
  writeFiles(directory, [
    ['composition.json', JSON.stringify({ ...composition, editions: base })],
    ['datacards/11th/gdc/necrons.json', JSON.stringify({ id: 'necrons', stratagems: [stratagem] })],
  ])
  const unpacked = path.join(directory, 'release')
  const record = {
    kind: 'ability',
    id: 'necrons.test.focused-fire',
    aliases: ['gdc.stratagem.f06fa0ef.917a.57c2.955d.325a082d942c'],
    summary,
  }
  writeFiles(unpacked, vsDataReleaseFiles([record]))
  const edition = checkVsDataRelease(
    unpacked,
    base.map((entry) => entry.edition),
  )
  fs.mkdirSync(path.join(directory, 'summaries'))
  compactVsDataRelease(unpacked, path.join(directory, 'summaries', `${edition}.json`))
  withholdCopiedSummaries(directory)
  const summaries = completeSteps(vsDataSummariesSteps(directory, []))
  const files = textFilesFrom(textSourcePaths(directory, readCatalogueComposition(directory)))
  const file = textFileId(Object.values(files).find((entry) => entry.url.endsWith('/necrons.json'))!.url)
  const token = (raw: string) => textToken({ file, transform: 'prose', hash: textHash(raw) })
  const detachment: CanonicalCatalogue['detachments'][number] = {
    catalogueId: 'necrons',
    faction: 'Necrons',
    factionSlug: 'necrons',
    id: 'test',
    slug: 'test',
    name: 'Test',
    points: null,
    dispositions: [],
    rules: [],
    enhancements: [],
    upgrades: [],
    stratagems: [
      {
        id: 'necrons.test.focused-fire',
        name: 'Focused Fire',
        cp: 1,
        type: 'Battle Tactic',
        phases: ['shooting'],
        turn: 'your-turn',
        description: `**When:** ${token(when)}\n\n**Effect:** ${token(effect)}`,
      },
    ],
    keywordRules: [],
    attribution: 'Community data',
    provenance: { definitions: { revision: 'one', detachmentId: 'test' }, datacards: { revision: 'one' } },
  }
  const catalogue: CanonicalCatalogue = {
    format: 'praetorium.canonical-catalogue.v1',
    compilerVersion: 1,
    revisions: {},
    datasheets: [],
    detachments: [detachment],
    ruleDocuments: [],
    issues: [],
  }
  const locations = { files, holds: () => false, recordsHolding: () => [] }
  const corpus = referenceCorpusFor({
    canonicalCatalogue: () => catalogue,
    catalogue: () => null,
    rules: () => null,
    textLocations: locations,
    summaries,
  })!
  const finder = ruleSummaryFinder(summaries)
  const published = <T>(value: T) => withTextPointers(value, locations, printedRuleSummary(finder))
  return {
    section: published(corpus.byId.get('detachment:necrons:test')!).sections.find((entry) => entry.title === 'Focused Fire')!,
    data: published(detachmentWithSummaries(finder, detachment)),
  }
}

it('serves a Stratagem’s summary in its parts in place of its words', () => {
  const { section } = agentAnswer('**When:** Your Shooting phase.\n\n**Effect:** Your unit hits more often this phase.')
  expect(section.ruleSummary).toEqual({
    text: '**When:** Your Shooting phase.\n\n**Effect:** Your unit hits more often this phase.',
    when: 'Your Shooting phase.',
    effect: 'Your unit hits more often this phase.',
  })
})

it('never serves a summary that repeats the official text', () => {
  const answer = agentAnswer(`Use it in your Shooting phase. ${effect}`)
  expect(JSON.stringify(answer)).not.toContain(effect)
})
