import { SurveyEventName, SurveyEventProperties } from 'posthog-js'
import { IMPORT_REPORT_MAX_LENGTH, type FeedbackKind } from '../../../contracts/feedback'

/** The launched API survey “App feedback” in PostHog; question ids key its stored responses. */
export const FEEDBACK_SURVEY = {
  id: '01a14042-306c-0000-f070-c4fc0aadccf2',
  name: 'App feedback',
  questions: {
    kind: { id: '38c2962f-d6ad-4daf-95b9-1a7b540d24ed', question: 'What kind of feedback?' },
    message: { id: '1e9261de-1a9e-4465-b2a6-cc43acd873f4', question: 'Message' },
    email: { id: '70a4cb45-54cf-44c4-aabf-bbdb555b9caf', question: 'Email for a reply' },
  },
} as const

export const FEEDBACK_MESSAGE_MAX_LENGTH = 2000

export function feedbackSurveyEvent({
  kind,
  message,
  email,
  screenshotUrl,
}: {
  kind: FeedbackKind
  message: string
  email?: string
  screenshotUrl?: string
}) {
  const answers = { kind, message: message.trim(), email: email?.trim() || undefined }
  const questions = Object.entries(FEEDBACK_SURVEY.questions) as [keyof typeof answers, { id: string; question: string }][]
  return {
    event: SurveyEventName.SENT,
    properties: {
      [SurveyEventProperties.SURVEY_ID]: FEEDBACK_SURVEY.id,
      [SurveyEventProperties.SURVEY_NAME]: FEEDBACK_SURVEY.name,
      [SurveyEventProperties.SURVEY_COMPLETED]: true,
      [SurveyEventProperties.SURVEY_QUESTIONS]: questions.map(([key, { id, question }]) => ({ id, question, response: answers[key] })),
      ...Object.fromEntries(
        questions.flatMap(([key, { id }]) =>
          answers[key] === undefined ? [] : [[`${SurveyEventProperties.SURVEY_RESPONSE}_${id}`, answers[key]]],
        ),
      ),
      ...(screenshotUrl ? { screenshot_url: screenshotUrl } : {}),
    },
  }
}

const IMPORT_FAILURES = {
  request: 'roster import failed (the request did not complete)',
  catalogue_unmatched: 'roster import failed (no faction matched)',
  review_required: 'roster import needed review',
} as const
const INPUT_KINDS = { text: 'pasted text', 'exchange-code': 'exchange code' } as const

/** A feedback response the import files by itself, carrying the exact input so the failure can be reproduced. */
export function importFailureReport({
  reason,
  inputKind,
  unknown,
  unplaced,
  input,
}: {
  reason: keyof typeof IMPORT_FAILURES
  inputKind: keyof typeof INPUT_KINDS
  unknown: readonly { name: string; reason: string }[]
  unplaced: readonly { unit: string; choices: readonly { name: string; reason: string }[] }[]
  input: string
}) {
  const header = [
    `Automatic report: ${IMPORT_FAILURES[reason]} from ${INPUT_KINDS[inputKind]}.`,
    `Unmatched: ${unknown.length}. Units with unplaced choices: ${unplaced.length}.`,
    ...unknown.map(({ name, reason: why }) => `- Could not match ${name}: ${why}`),
    ...unplaced.flatMap(({ unit, choices }) => choices.map(({ name, reason: why }) => `- ${unit}: could not place ${name}: ${why}`)),
    '',
    'Input:',
    '',
  ].join('\n')
  const room = Math.max(0, IMPORT_REPORT_MAX_LENGTH - header.length)
  const message = header + (input.length > room ? `${input.slice(0, room)}\n[truncated ${input.length - room} characters]` : input)
  const { event, properties } = feedbackSurveyEvent({ kind: 'Problem', message })
  return { event, properties: { ...properties, automatic: true, source: 'import_failure' }, message }
}
