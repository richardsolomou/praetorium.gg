import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import composition from '../../catalogue/composition.json' with { type: 'json' }
import { completeSteps } from '../shared/steps'
import { readCatalogueComposition } from './catalogueComposition'
import { textHash, textSourceFiles } from './sourceTexts'
import { vsDataReleaseFiles, writeFiles } from './vsData.fixtures'
import { vsDataSummariesSteps } from './vsDataSummaries'

const effect = 'Until the end of the phase, each time a model in your unit makes an attack, add 1 to the Hit roll.'
const stratagem = { id: 'f06fa0ef-917a-57c2-955d-325a082d942c', when: { en: 'Your Shooting phase.' }, effect: { en: effect } }
const directories: string[] = []

function snapshot(summary: string, update = 'MFM 1.6') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-data-summaries-'))
  directories.push(directory)
  const base = composition.editions.filter((entry) => 'base' in entry && entry.base)
  const record = {
    kind: 'ability',
    id: 'necrons.test.focused-fire',
    aliases: ['gdc.stratagem.f06fa0ef.917a.57c2.955d.325a082d942c'],
    summary,
  }
  writeFiles(directory, [
    ['composition.json', JSON.stringify({ ...composition, editions: base })],
    ['datacards/11th/gdc/necrons.json', JSON.stringify({ stratagems: [stratagem] })],
    ...vsDataReleaseFiles([record], update).map(([file, text]): [string, string] => [`summaries/${file}`, text]),
  ])
  const summaries = completeSteps(vsDataSummariesSteps(directory, []))
  const [file] = Object.keys(textSourceFiles(directory, readCatalogueComposition(directory)))
  return { summaries, file: file! }
}

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

it('names a stratagem summary for every string its card prints', () => {
  const { summaries, file } = snapshot('Pick one of your units to hit more often this phase.')
  const answer = summaries!.summariesIn(file)
  expect([answer.texts[textHash(stratagem.when.en)], answer.texts[textHash(effect)]]).toEqual([
    ['ability:necrons.test.focused-fire'],
    ['ability:necrons.test.focused-fire'],
  ])
})

it('withholds a summary that repeats a sentence of the card', () => {
  const { summaries, file } = snapshot(`Use this in your Shooting phase. ${effect}`)
  expect(summaries!.summariesIn(file).texts).toEqual({})
})

it('summarizes no rules version but the one the release describes', () => {
  expect(snapshot('Pick one of your units to hit more often this phase.', 'MFM 1.5').summaries).toBeNull()
})
