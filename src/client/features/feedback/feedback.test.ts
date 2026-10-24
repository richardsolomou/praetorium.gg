import { describe, expect, it } from 'vitest'
import { IMPORT_REPORT_MAX_LENGTH, readTicketMessage, ticketSubject } from '../../../contracts/feedback'
import { version } from '../../../../package.json'
import { FEEDBACK_SURVEY, feedbackSurveyEvent, feedbackTicketMessage, importFailureReport } from './feedback'

const { kind, message } = FEEDBACK_SURVEY.questions

describe('feedbackSurveyEvent', () => {
  it('sends a survey response PostHog attributes to the feedback survey', () => {
    expect(feedbackSurveyEvent({ kind: 'Problem', message: 'Import failed' })).toEqual({
      event: 'survey sent',
      properties: {
        $survey_id: FEEDBACK_SURVEY.id,
        $survey_name: 'App feedback',
        $survey_completed: true,
        $survey_questions: [
          { id: kind.id, question: kind.question, response: 'Problem' },
          { id: message.id, question: message.question, response: 'Import failed' },
        ],
        [`$survey_response_${kind.id}`]: 'Problem',
        [`$survey_response_${message.id}`]: 'Import failed',
      },
    })
  })

  it('trims the message', () => {
    expect(feedbackSurveyEvent({ kind: 'Problem', message: '  Broken  ' }).properties).toHaveProperty(
      `$survey_response_${message.id}`,
      'Broken',
    )
  })
})

describe('feedbackTicketMessage', () => {
  it('follows the trimmed message with its kind and the running version', () => {
    expect(feedbackTicketMessage({ kind: 'Idea', message: '  Group factions by alliance  ' })).toBe(
      `Group factions by alliance\n\nIdea · Praetorium ${version}`,
    )
  })

  it('links an attached screenshot last', () => {
    expect(
      feedbackTicketMessage({ kind: 'Problem', message: 'Hi', screenshotUrl: 'https://praetorium.gg/api/feedback-screenshots/a' })
        .split('\n')
        .at(-1),
    ).toBe('Screenshot: https://praetorium.gg/api/feedback-screenshots/a')
  })
})

describe('readTicketMessage', () => {
  it('separates what the player wrote from the details the app added', () => {
    expect(readTicketMessage(feedbackTicketMessage({ kind: 'Idea', message: 'Group factions\n\nby alliance' }))).toEqual({
      body: 'Group factions\n\nby alliance',
      kind: 'Idea',
      version,
      screenshot: false,
    })
  })

  it('notes an attached screenshot without exposing its link', () => {
    const content = feedbackTicketMessage({
      kind: 'Problem',
      message: 'Hi',
      screenshotUrl: 'https://praetorium.gg/api/feedback-screenshots/a',
    })
    expect(readTicketMessage(content)).toEqual({ body: 'Hi', kind: 'Problem', version, screenshot: true })
  })

  it('leaves a message the app did not compose as it is', () => {
    expect(readTicketMessage('Thanks!\n\nIdea · elsewhere')).toEqual({ body: 'Thanks!\n\nIdea · elsewhere', screenshot: false })
  })
})

describe('ticketSubject', () => {
  it('names a conversation by the first line the player wrote', () => {
    expect(ticketSubject(feedbackTicketMessage({ kind: 'Problem', message: 'Picker will not scroll\n\nOn my iPad' }))).toBe(
      'Picker will not scroll',
    )
  })

  it('shortens a long first line with an ellipsis', () => {
    expect(ticketSubject('a'.repeat(100))).toBe(`${'a'.repeat(71)}…`)
  })
})

describe('importFailureReport', () => {
  const report = (input: string) =>
    importFailureReport({
      reason: 'review_required',
      inputKind: 'text',
      unknown: [{ name: 'Gretchin', reason: 'no such datasheet' }],
      unplaced: [{ unit: 'Boyz', choices: [{ name: 'Big shoota', reason: 'no slot left' }] }],
      input,
    }).properties.$survey_questions[1]!.response

  it('files a problem led by what went wrong and followed by the exact input', () => {
    expect(report('++ Orks ++\nBoyz')).toBe(
      [
        'Automatic report: roster import needed review from pasted text.',
        'Unmatched: 1. Units with unplaced choices: 1.',
        '- Could not match Gretchin: no such datasheet',
        '- Boyz: could not place Big shoota: no slot left',
        '',
        'Input:',
        '++ Orks ++\nBoyz',
      ].join('\n'),
    )
  })

  it('says how many characters of a long input were left out', () => {
    const input = 'x'.repeat(IMPORT_REPORT_MAX_LENGTH)
    const sent = report(input)
    const kept = sent.slice(sent.indexOf('Input:\n') + 'Input:\n'.length, sent.lastIndexOf('\n[truncated'))
    expect(sent.endsWith(`\n[truncated ${input.length - kept.length} characters]`)).toBe(true)
  })

  it('fills the report up to its limit before the truncation marker', () => {
    const sent = report('x'.repeat(IMPORT_REPORT_MAX_LENGTH))
    expect(sent.lastIndexOf('\n[truncated')).toBe(IMPORT_REPORT_MAX_LENGTH)
  })

  it('marks the response as automatic', () => {
    expect(
      importFailureReport({ reason: 'request', inputKind: 'exchange-code', unknown: [], unplaced: [], input: 'CODE' }).properties,
    ).toMatchObject({ automatic: true, source: 'import_failure', [`$survey_response_${kind.id}`]: 'Problem' })
  })
})
