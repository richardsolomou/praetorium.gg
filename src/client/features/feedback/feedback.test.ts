import { describe, expect, it } from 'vitest'
import { FEEDBACK_SURVEY, feedbackSurveyEvent } from './feedback'

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
