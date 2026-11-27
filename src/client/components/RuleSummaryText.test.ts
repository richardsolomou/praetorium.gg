import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import type { RuleSummary } from '../../contracts/rules'
import { RuleSummaryText } from './RuleSummaryText'

const paragraph = (text: string) => [{ paragraph: [{ text }] }]
const parts = { when: paragraph('Your Shooting phase.'), target: paragraph('One unit of yours.'), effect: paragraph('It hits more often.') }
const stratagem: RuleSummary = { parts, questions: [] }
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
  expect(shownParts({ parts: { ...parts, restrictions: paragraph('Once per battle.') }, questions: [] }).at(-1)).toEqual([
    'Restrictions',
    'Once per battle.',
  ]))

it('shows a summary not written in parts as its paragraphs', () =>
  expect(markup({ blocks: paragraph('Your Shooting phase.'), questions: [] })).not.toContain('<dl'))
