import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { descriptionKey, findDescription, loadWahapediaDescriptions } from './wahapedia'

let directory: string

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-wahapedia-'))
})

afterEach(() => fs.rmSync(directory, { recursive: true, force: true }))

it('reads multiline HTML descriptions as plain text', () => {
  write('Stratagems.csv', 'name|detachment|description|\nCalculated Targeting|Cryptek Conclave|<b>WHEN:</b><br>After moving.|\n')
  write('Enhancements.csv', 'name|detachment|description|\n')
  expect(loadWahapediaDescriptions(directory)?.stratagems.get(descriptionKey('Cryptek Conclave', 'Calculated Targeting'))).toBe(
    'WHEN:\nAfter moving.',
  )
})

it('reads current descriptions from a pinned faction page', () => {
  fs.mkdirSync(path.join(directory, 'pages'))
  write(
    'pages/necrons.html',
    '<div class="clFl"><h2 class="outline_header">Hand of the Dynasty1DP</h2><div class="Columns2"><div class="BreakInsideAvoid"><h3>Hypermotility Protocols</h3><p>Move quickly.</p></div><div class="BreakInsideAvoid"><div class="td_w"><ul class="EnhancementsPts"><li><span>Tools of Dominion<span class="EnhUpgrade">UPGRADE</span></span></li></ul><p class="ShowFluff">Fluff.</p><p>Gain [LETHAL HITS].</p></div></div><div class="str11Wrap"><div class="str11Name">DOMINANCE PROTOCOLS</div><div class="str11Text"><b>EFFECT:</b> Add 1 to OC.</div></div></div></div>',
  )
  const loaded = loadWahapediaDescriptions(directory)
  expect({
    rule: loaded?.detachmentAbilities.get('hand-of-the-dynasty')?.[0],
    enhancement: loaded?.enhancements.get(descriptionKey('Hand of the Dynasty', 'Tools of Dominion (Upgrade)')),
    stratagem: loaded?.stratagems.get(descriptionKey('Hand of the Dynasty', 'Dominance Protocols')),
  }).toEqual({
    rule: { name: 'Hypermotility Protocols', description: 'Move quickly.' },
    enhancement: 'Gain [LETHAL HITS].',
    stratagem: 'EFFECT: Add 1 to OC.',
  })
})

it('reads an enhancement whose rule includes a table instead of a paragraph', () => {
  fs.mkdirSync(path.join(directory, 'pages'))
  write(
    'pages/mechanicus.html',
    '<div class="clFl"><h2 class="outline_header">Lords of the Forge1DP</h2><div class="Columns2"><div class="td_w"><ul class="EnhancementsPts"><li><span>TL-4Ø9</span></li></ul><p class="ShowFluff">Fluff.</p><span>Model only. This model has the following weapon:</span><table class="wTable"><tr><td>RANGE</td><td>A</td></tr><tr><td>24&quot;</td><td>3</td></tr></table><div class="faqErrataStrat">Old text.</div></div></div></div>',
  )

  expect(loadWahapediaDescriptions(directory)?.enhancements.get(descriptionKey('Lords of the Forge', 'TL-4Ø9'))).toBe(
    'Model only. This model has the following weapon:\n\nRANGE  A\n24"    3',
  )
})

it('reads stratagems nested inside a detachment layout block', () => {
  fs.mkdirSync(path.join(directory, 'pages'))
  write(
    'pages/necrons.html',
    '<div class="clFl"><h2 class="outline_header">Cursed Legion2DP</h2><div class="Columns2"></div><div class="layout"><div class="Columns2"><div class="str11Wrap"><div class="str11Name">DRIVEN TO BUTCHERY</div><div class="str11Text"><b>EFFECT:</b> Fight on death.</div></div></div></div></div>',
  )
  expect(loadWahapediaDescriptions(directory)?.stratagems.get(descriptionKey('Cursed Legion', 'Driven to Butchery'))).toBe(
    'EFFECT: Fight on death.',
  )
})

it('reads every ability belonging to a detachment', () => {
  write(
    'Detachment_abilities.csv',
    'name|detachment|description|\nCold Fervour|Cursed Legion|<b>First rule.</b>|\nShared Madness|Cursed Legion|Second rule.|\n',
  )
  write('Stratagems.csv', 'name|detachment|description|\n')
  write('Enhancements.csv', 'name|detachment|description|\n')
  expect(loadWahapediaDescriptions(directory)?.detachmentAbilities.get('cursed-legion')).toEqual([
    { name: 'Cold Fervour', description: 'First rule.' },
    { name: 'Shared Madness', description: 'Second rule.' },
  ])
})

it('reads unambiguous datasheet ability descriptions', () => {
  write('Abilities.csv', 'name|description|\nOath of Moment|Re-roll Hit rolls.|\n')
  write('Datasheets_abilities.csv', 'name|description|\nOath of Moment|Re-roll Hit rolls.|\n')
  expect(loadWahapediaDescriptions(directory)?.abilities.get('oath-of-moment')).toBe('Re-roll Hit rolls.')
})

it('drops datasheet ability names with conflicting descriptions', () => {
  write('Abilities.csv', 'name|description|\nShared Name|First rule.|\n')
  write('Datasheets_abilities.csv', 'name|description|\nShared Name|Second rule.|\n')
  expect(loadWahapediaDescriptions(directory)?.abilities.has('shared-name') ?? false).toBe(false)
})

it('drops conflicting descriptions for the same rule', () => {
  write(
    'Stratagems.csv',
    'name|detachment|description|\nCalculated Targeting|Cryptek Conclave|First|\nCalculated Targeting|Cryptek Conclave|Second|\n',
  )
  write('Enhancements.csv', 'name|detachment|description|\n')
  expect(loadWahapediaDescriptions(directory)?.stratagems.has(descriptionKey('Cryptek Conclave', 'Calculated Targeting')) ?? false).toBe(
    false,
  )
})

it('matches an unambiguous spelling difference within one detachment', () => {
  const descriptions = new Map([[descriptionKey('Cursed Legion', 'Mark of the Nekrosor'), 'Add 1 to the Hit roll.']])
  expect(findDescription(descriptions, 'Cursed Legion', 'Mask of the Nekrosor')).toBe('Add 1 to the Hit roll.')
})

it('does not choose between similar names', () => {
  const descriptions = new Map([
    [descriptionKey('Cursed Legion', 'Mark of the Nekrosor'), 'First'],
    [descriptionKey('Cursed Legion', 'Murk of the Nekrosor'), 'Second'],
  ])
  expect(findDescription(descriptions, 'Cursed Legion', 'Mask of the Nekrosor')).toBeNull()
})

it('does not match across detachments', () => {
  const descriptions = new Map([[descriptionKey('Other Legion', 'Mark of the Nekrosor'), 'Wrong detachment']])
  expect(findDescription(descriptions, 'Cursed Legion', 'Mask of the Nekrosor')).toBeNull()
})

it('does not choose between similar detachments', () => {
  const descriptions = new Map([
    [descriptionKey('Brood Brother Auxilia', 'Martial Espionage'), 'First'],
    [descriptionKey('Brood Brothers Auxiliaa', 'Martial Espionage'), 'Second'],
  ])
  expect(findDescription(descriptions, 'Brood Brothers Auxilia', 'Martial Espionage')).toBeNull()
})

const write = (name: string, contents: string) => fs.writeFileSync(path.join(directory, name), contents)
