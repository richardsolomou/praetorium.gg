import { expect, it } from 'vitest'
import { spannedParagraph, summaryBlocks, summaryText, unitAbilitySlug } from './summaryMarkdown'

it('splits paragraphs at a blank line and joins the lines within one', () => {
  expect(summaryBlocks('Roll a D6.\nAdd 1.\n\nOn a 4+, gain 1 CP.')).toEqual([
    { paragraph: [{ text: 'Roll a D6. Add 1.' }] },
    { paragraph: [{ text: 'On a 4+, gain 1 CP.' }] },
  ])
})

it('reads a block of "- " lines as an unordered list', () => {
  expect(summaryBlocks('Pick one:\n\n- Lethal Hits\n- **Sustained Hits 1**')).toEqual([
    { paragraph: [{ text: 'Pick one:' }] },
    { list: 'unordered', items: [[{ text: 'Lethal Hits' }], [{ text: 'Sustained Hits 1', bold: true }]] },
  ])
})

it('reads a block of numbered lines as an ordered list', () => {
  expect(summaryBlocks('1. Roll.\n2. Re-roll.')).toEqual([{ list: 'ordered', items: [[{ text: 'Roll.' }], [{ text: 'Re-roll.' }]] }])
})

it('links a VS Data record, in bold or not', () => {
  expect(summaryBlocks('Use **[Deep Strike](vsdata:core-ability/deep-strike)** in [Reserves](vsdata:core-rule/reserves).')).toEqual([
    {
      paragraph: [
        { text: 'Use ' },
        { text: 'Deep Strike', bold: true, target: { kind: 'core-ability', id: 'deep-strike' } },
        { text: ' in ' },
        { text: 'Reserves', target: { kind: 'core-rule', id: 'reserves' } },
        { text: '.' },
      ],
    },
  ])
})

it('reads anything outside the grammar as plain text', () => {
  const text = '<b>Bold</b> ![map](x.png) [site](https://example.com) **open *one* [RAPID FIRE 1]'
  expect(summaryBlocks(text)).toEqual([{ paragraph: [{ text }] }])
})

it('keeps a block mixing list and plain lines a paragraph', () => {
  expect(summaryBlocks('- One\nTwo')).toEqual([{ paragraph: [{ text: '- One Two' }] }])
})

it('says the same words without the markup', () => {
  expect(summaryText('**Bold** and [a link](vsdata:core-rule/x).\n\n- one')).toBe('Bold and a link.\n\none')
})

it('cuts a spanned summary at its spans, leaving out one that overlaps the one before', () => {
  expect(
    spannedParagraph('Roll a D6.', [
      { start: 0, end: 4, bold: true },
      { start: 2, end: 6 },
    ]),
  ).toEqual({
    paragraph: [{ text: 'Roll', bold: true }, { text: ' a D6.' }],
  })
})

it('reads an ability name and its VS Data id alike', () => {
  expect(
    [
      'Damaged: 1-5 Wounds Remaining',
      '[Psychic Abilities] - Smite',
      '*Lord’s Will (Aura)',
      'My Will Be Done',
      'guardian-protocols-aura',
      'miraculous-saviour-once-per-battle-per-army',
      'Chief Librarian (Psyker level 3)',
      'chief-librarian-psyker-level-3',
    ].map(unitAbilitySlug),
  ).toEqual([
    'damaged',
    'smite',
    'lords-will',
    'my-will-be-done',
    'guardian-protocols',
    'miraculous-saviour',
    'chief-librarian',
    'chief-librarian',
  ])
})
