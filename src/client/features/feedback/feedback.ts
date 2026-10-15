import { SurveyEventName, SurveyEventProperties } from 'posthog-js'

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

/** The survey's choices, in its order. */
export const FEEDBACK_KINDS = ['Problem', 'Idea', 'Other'] as const
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]

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
