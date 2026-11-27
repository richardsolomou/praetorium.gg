import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import type { RuleSummary } from '../../contracts/rules'
import { RuleSummaryText } from './RuleSummaryText'

const paragraph = (text: string) => [{ paragraph: [{ text }] }]
const labelled = (label: string, text: string) => ({ paragraph: [{ text: `${label}:`, bold: true as const }, { text: ` ${text}` }] })
const stratagem: RuleSummary = {
  blocks: [labelled('When', 'Your Shooting phase.'), labelled('Target', 'One unit of yours.'), labelled('Effect', 'It hits more often.')],
  questions: [],
  parts: { when: paragraph('Your Shooting phase.'), target: paragraph('One unit of yours.'), effect: paragraph('It hits more often.') },
}
const markup = (summary: RuleSummary) => renderToStaticMarkup(createElement(RuleSummaryText, { summary }))
/** Each part as its label and the text beside it. */
const shownParts = (summary: RuleSummary) =>
  [...markup(summary).matchAll(/<dt[^>]*>([^<]*)<\/dt><dd[^>]*>(.*?)<\/dd>/g)].map(([, label, text]) => [
    label,
    text!.replaceAll(/<[^>]+>/g, ''),
  ])

it('shows each part of a Stratagem written in parts beside its label', () =>
  expect(shownParts(stratagem)).toEqual([
    ['When', 'Your Shooting phase.'],
    ['Target', 'One unit of yours.'],
    ['Effect', 'It hits more often.'],
  ]))

it('shows a Stratagem’s Restrictions last, where it has them', () =>
  expect(shownParts({ ...stratagem, parts: { ...stratagem.parts!, restrictions: paragraph('Once per battle.') } }).at(-1)).toEqual([
    'Restrictions',
    'Once per battle.',
  ]))

it('shows a summary not written in parts as its paragraphs', () => expect(markup({ ...stratagem, parts: undefined })).not.toContain('<dl'))
