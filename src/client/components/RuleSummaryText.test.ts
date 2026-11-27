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
const labels = (summary: RuleSummary) =>
  [...renderToStaticMarkup(createElement(RuleSummaryText, { summary })).matchAll(/<dt[^>]*>([^<]*)<\/dt>/g)].map((match) => match[1])

it('labels each part of a Stratagem written in parts', () => expect(labels(stratagem)).toEqual(['When', 'Target', 'Effect']))

it('labels a Stratagem’s Restrictions where it has them', () =>
  expect(labels({ ...stratagem, parts: { ...stratagem.parts!, restrictions: paragraph('Once per battle.') } })).toEqual([
    'When',
    'Target',
    'Effect',
    'Restrictions',
  ]))

it('shows a summary not written in parts as its paragraphs', () =>
  expect(renderToStaticMarkup(createElement(RuleSummaryText, { summary: { ...stratagem, parts: undefined } }))).toContain(
    '<strong class="font-semibold text-bone">When:</strong>',
  ))
