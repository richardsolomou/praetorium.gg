import { describe, expect, it } from 'vitest'
import { FEEDBACK_SURVEY, IMPORT_REPORT_MAX_LENGTH, feedbackSurveyEvent, importFailureReport } from './feedback'

const { kind, message, email } = FEEDBACK_SURVEY.questions

describe('feedbackSurveyEvent', () => {
  it('sends a survey response PostHog attributes to the feedback survey', () => {
    expect(feedbackSurveyEvent({ kind: 'Idea', message: 'More factions', email: 'player@example.com' })).toEqual({
      event: 'survey sent',
      properties: {
        $survey_id: FEEDBACK_SURVEY.id,
        $survey_name: 'App feedback',
        $survey_completed: true,
        $survey_questions: [
          { id: kind.id, question: kind.question, response: 'Idea' },
          { id: message.id, question: message.question, response: 'More factions' },
          { id: email.id, question: email.question, response: 'player@example.com' },
        ],
        [`$survey_response_${kind.id}`]: 'Idea',
        [`$survey_response_${message.id}`]: 'More factions',
        [`$survey_response_${email.id}`]: 'player@example.com',
      },
    })
  })

  it('trims the message', () => {
    expect(feedbackSurveyEvent({ kind: 'Problem', message: '  Broken  ' }).properties).toHaveProperty(
      `$survey_response_${message.id}`,
      'Broken',
    )
  })

  it('leaves a blank email unanswered', () => {
    expect(feedbackSurveyEvent({ kind: 'Other', message: 'Hi', email: '   ' }).properties).not.toHaveProperty(
      `$survey_response_${email.id}`,
    )
  })

  it('leaves the email unanswered for a signed-in player', () => {
    expect(feedbackSurveyEvent({ kind: 'Other', message: 'Hi' }).properties.$survey_questions.at(-1)).toEqual({
      id: email.id,
      question: email.question,
      response: undefined,
    })
  })

  it('links an attached screenshot', () => {
    expect(
      feedbackSurveyEvent({ kind: 'Problem', message: 'Hi', screenshotUrl: 'https://praetorium.gg/api/feedback-screenshots/a.png' })
        .properties,
    ).toHaveProperty('screenshot_url', 'https://praetorium.gg/api/feedback-screenshots/a.png')
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
    }).properties.$survey_questions[1]!.response!

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
