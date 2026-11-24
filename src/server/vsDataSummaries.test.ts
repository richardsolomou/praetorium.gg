import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import composition from '../../catalogue/composition.json' with { type: 'json' }
import { completeSteps } from '../shared/steps'
import { readCatalogueComposition } from './catalogueComposition'
import { textFileId, textHash, textSourcePaths } from './sourceTexts'
import { vsDataReleaseFiles, writeFiles } from './vsData.fixtures'
import { checkVsDataRelease, compactVsDataRelease } from './vsDataRelease'
import { MISSION_SUMMARIES, type RuleDocument } from '../contracts/rules'
import { abilitySummaryIn } from '../shared/vsDataAbilities'
import { NO_RULE_SUMMARIES, summariesOfFile, type VsDataSummaries, vsDataSummariesSteps, withholdCopiedSummaries } from './vsDataSummaries'

const effect = 'Until the end of the phase, each time a model in your unit makes an attack, add 1 to the Hit roll.'
const stratagem = { id: 'f06fa0ef-917a-57c2-955d-325a082d942c', when: { en: 'Your Shooting phase.' }, effect: { en: effect } }
const directories: string[] = []

const record = (summary: string) => ({
  kind: 'ability',
  id: 'necrons.test.focused-fire',
  aliases: ['gdc.stratagem.f06fa0ef.917a.57c2.955d.325a082d942c'],
  summary,
})
const { summaries: folded, ...codex } = composition.editions.find((entry) => entry.edition.id === 'custodes-11e')!

/** A snapshot of the base rules and the Custodes codex, each printing the stratagem, with a release per summary given. */
function snapshot(
  releases: { update: string; summary: string; data?: Record<string, unknown> }[],
  others: Parameters<typeof vsDataReleaseFiles>[0] = [],
  cards: [string, unknown][] = [],
  documents: readonly RuleDocument[] = [],
  /** Whether the codex reads the base rules version's release, as VS Data folded it into that one. */
  readsBase = false,
) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-data-summaries-'))
  directories.push(directory)
  const base = composition.editions.filter((entry) => 'base' in entry && entry.base)
  writeFiles(directory, [
    ['composition.json', JSON.stringify({ ...composition, editions: [...base, readsBase ? { ...codex, summaries: folded } : codex] })],
    ['datacards/11th/gdc/necrons.json', JSON.stringify({ id: 'necrons', stratagems: [stratagem] })],
    ['editions/custodes-11e/datacards/11th/gdc/necrons.json', JSON.stringify({ id: 'necrons', stratagems: [stratagem] })],
    ...cards.map(([file, card]): [string, string] => [`datacards/11th/gdc/${file}`, JSON.stringify(card)]),
  ])
  fs.mkdirSync(path.join(directory, 'summaries'))
  releases.forEach(({ update, summary, data }, at) => {
    const unpacked = path.join(directory, `release-${at}`)
    writeFiles(unpacked, vsDataReleaseFiles([{ ...record(summary), ...(data ? { data } : {}) }, ...others], update))
    const edition = checkVsDataRelease(
      unpacked,
      [...base, codex].map((entry) => entry.edition),
    )
    compactVsDataRelease(unpacked, path.join(directory, 'summaries', `${edition}.json`))
  })
  withholdCopiedSummaries(directory)
  const summaries = completeSteps(vsDataSummariesSteps(directory, documents))
  const files = textSourcePaths(directory, readCatalogueComposition(directory))
  const file = (edition: boolean, name = 'necrons.json') =>
    textFileId(files.find(({ path: at }) => at.includes('/editions/') === edition && at.endsWith(`/${name}`))!.url)
  return { summaries, base: file(false), custodes: file(true), card: (name: string) => file(false, name) }
}

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

it('names a stratagem summary for every string its card prints', () => {
  const { summaries, base } = snapshot([{ update: 'MFM 1.6', summary: 'Pick one of your units to hit more often this phase.' }])
  const answer = summaries!.summariesIn(base)
  expect([answer.texts[textHash(stratagem.when.en)], answer.texts[textHash(effect)]]).toEqual([
    ['ability:necrons.test.focused-fire'],
    ['ability:necrons.test.focused-fire'],
  ])
})

it('withholds a summary that repeats a sentence of the card', () => {
  const { summaries, base } = snapshot([{ update: 'MFM 1.6', summary: `Use this in your Shooting phase. ${effect}` }])
  expect(summaries!.summariesIn(base).texts).toEqual({})
})

it('summarizes no rules version but the one a release describes', () => {
  const { summaries, custodes } = snapshot([{ update: 'MFM 1.6', summary: 'Pick one of your units to hit more often.' }])
  expect(summaries!.summariesIn(custodes).texts).toEqual({})
})

it('reads a rules version VS Data folded into another with that one’s release', () => {
  const { summaries, custodes } = snapshot([{ update: 'MFM 1.6', summary: 'Pick one of your units to hit more often.' }], [], [], [], true)
  expect(summaries!.summariesIn(custodes).texts[textHash(effect)]).toEqual(['ability:necrons.test.focused-fire'])
})

it('reads an earlier rules version’s cards with that version’s own release', () => {
  const { summaries, custodes } = snapshot([
    { update: 'MFM 1.6', summary: 'Pick one of your units to hit more often.' },
    { update: codex.edition.name, summary: 'Under the codex, pick a unit to hit more often.' },
  ])
  const answer = summaries!.summariesIn(custodes)
  expect(answer.records[answer.texts[textHash(effect)]![0]!]?.blocks).toEqual([
    { paragraph: [{ text: 'Under the codex, pick a unit to hit more often.' }] },
  ])
})

it('opens a weapon ability a summary prints in brackets', () => {
  const lethalHits = { kind: 'weapon-ability', id: 'lethal-hits', aliases: [], summary: 'A Critical Hit wounds automatically.' }
  const { summaries, base } = snapshot([{ update: 'MFM 1.6', summary: 'Its weapons gain [LETHAL HITS] this phase.' }], [lethalHits])
  expect(summaries!.summariesIn(base).records['ability:necrons.test.focused-fire']?.blocks).toEqual([
    {
      paragraph: [
        { text: 'Its weapons gain ' },
        { text: '[LETHAL HITS]', ability: 'weapon-ability:lethal-hits' },
        { text: ' this phase.' },
      ],
    },
  ])
})

it('opens the weapon ability a run names where its link names the ability’s core rule', () => {
  const devastatingWounds = {
    kind: 'weapon-ability',
    id: 'devastating-wounds',
    aliases: [],
    summary: 'A Critical Wound inflicts mortal wounds.',
  }
  const summary = 'Its weapons gain [DEVASTATING WOUNDS].'
  const data = { summarySpans: [{ start: 17, end: 37, bold: true, target: { kind: 'core-rule', id: 'devastating-wounds' } }] }
  const { summaries, base } = snapshot([{ update: 'MFM 1.6', summary, data }], [devastatingWounds])
  expect(summaries!.summariesIn(base).records['ability:necrons.test.focused-fire']?.blocks[0]).toEqual({
    paragraph: [
      { text: 'Its weapons gain ' },
      { text: '[DEVASTATING WOUNDS]', bold: true, ability: 'weapon-ability:devastating-wounds' },
      { text: '.' },
    ],
  })
})

it('serves a Markdown summary as its paragraphs and lists, its links landing on the rules they name', () => {
  const summary = 'Pick one:\n\n- [Lethal Hits](vsdata:weapon-ability/lethal-hits)\n- **Re-roll** a Hit roll of 1.'
  const lethalHits = { kind: 'weapon-ability', id: 'lethal-hits', aliases: [], summary: 'A Critical Hit wounds automatically.' }
  const { summaries, base } = snapshot([{ update: 'MFM 1.6', summary }], [lethalHits])
  expect(summaries!.summariesIn(base).records['ability:necrons.test.focused-fire']?.blocks).toEqual([
    { paragraph: [{ text: 'Pick one:' }] },
    {
      list: 'unordered',
      items: [
        [{ text: 'Lethal Hits', ability: 'weapon-ability:lethal-hits' }],
        [{ text: 'Re-roll', bold: true }, { text: ' a Hit roll of 1.' }],
      ],
    },
  ])
})

it('reads a core rule clarification printed in an FAQ’s own words as that FAQ', () => {
  const ruling = 'Measure to the closest point of the base.'
  const faq = { kind: 'faq', id: 'core-rules.errata.drawing-a-line', aliases: ['gdc.faq.72526908.2ec3.4aba.be92.5988e42686e5'] }
  const { summaries, card } = snapshot(
    [{ update: 'MFM 1.6', summary: 'Pick one of your units to hit more often.' }],
    [{ ...faq, summary: 'Lines run between the nearest edges of the bases.' }],
    [
      ['faqs.json', { faqs: [{ id: '72526908-2ec3-4aba-be92-5988e42686e5', errataText: ruling }] }],
      [
        'core/core_rules.json',
        {
          cardType: 'coreRules',
          sections: [
            {
              containers: [
                { id: 'rule', components: [{ type: 'accordion', title: { en: '01.04.06 - Drawing a Line' }, text: { en: ruling } }] },
              ],
            },
          ],
        },
      ],
    ],
  )
  expect(summaries!.summariesIn(card('core_rules.json')).entries['rule#01.04.06']).toBe('faq:core-rules.errata.drawing-a-line')
})

it('serves a linked bracketed weapon ability as that ability, bold with its brackets', () => {
  const summary = 'Its weapons gain **[[DEVASTATING WOUNDS]](vsdata:weapon-ability/devastating-wounds)** this phase.'
  const devastating = { kind: 'weapon-ability', id: 'devastating-wounds', aliases: [], summary: 'Critical Wounds become mortal wounds.' }
  const { summaries, base } = snapshot([{ update: 'MFM 1.6', summary }], [devastating])
  expect(summaries!.summariesIn(base).records['ability:necrons.test.focused-fire']?.blocks).toEqual([
    {
      paragraph: [
        { text: 'Its weapons gain ' },
        { text: '[DEVASTATING WOUNDS]', bold: true, ability: 'weapon-ability:devastating-wounds' },
        { text: ' this phase.' },
      ],
    },
  ])
})

it('links a bracketed weapon ability to the core rule that prints it', () => {
  const devastating = { kind: 'weapon-ability', id: 'devastating-wounds', aliases: [], summary: 'Critical Wounds become mortal wounds.' }
  const rule = { kind: 'core-rule', id: 'devastating-wounds', aliases: ['rule#24.05'], summary: 'Critical Wounds become mortal wounds.' }
  const document = { slug: 'core-rules', sections: [{ slug: 'core-abilities', entries: [{ id: 'rule#24.05', anchor: '24.05' }] }] }
  const { summaries, base } = snapshot(
    [{ update: 'MFM 1.6', summary: 'Its weapons gain [DEVASTATING WOUNDS] this phase.' }],
    [devastating, rule],
    [],
    [document as unknown as RuleDocument],
  )
  expect(summaries!.summariesIn(base).records['ability:necrons.test.focused-fire']?.blocks[0]).toEqual({
    paragraph: [
      { text: 'Its weapons gain ' },
      {
        text: '[DEVASTATING WOUNDS]',
        link: { document: 'core-rules', section: 'core-abilities', anchor: '24.05' },
        ability: 'weapon-ability:devastating-wounds',
      },
      { text: ' this phase.' },
    ],
  })
})

it('reads a detachment rule under the id VS Data aliases it by, for its own faction and another fielding the detachment', () => {
  const bloodtainted = {
    kind: 'ability',
    id: 'chaos-daemons.blood-legion.blood-tainted',
    aliases: ['chaos-daemons.blood-legion.bloodtainted'],
    summary: 'Fight with renewed fury.',
  }
  const { summaries } = snapshot([{ update: 'MFM 1.6', summary: 'Pick one of your units to hit more often.' }], [bloodtainted])
  const units = summaries!.unitsIn(null)
  const summary = units.abilities['chaos-daemons.blood-legion.blood-tainted']
  expect(
    ['@titanicus-traitoris.blood-legion', '@chaos-daemons.blood-legion'].map((owner) => abilitySummaryIn(units, owner, 'Bloodtainted')),
  ).toEqual([summary, summary])
})

it('serves the mission pack’s summaries, which no source file holds', () => {
  const missions = { records: { 'mission-award:pack.card.o1-s1': { blocks: [], questions: [] } }, texts: {}, entries: {} }
  const summaries = {
    summariesIn: (file: string) => (file === MISSION_SUMMARIES ? missions : NO_RULE_SUMMARIES),
  } as unknown as VsDataSummaries
  expect(summariesOfFile(MISSION_SUMMARIES, {}, summaries)).toBe(missions)
})
