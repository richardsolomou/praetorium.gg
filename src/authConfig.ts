export const SOCIAL_PROVIDERS = ['google', 'discord'] as const

export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number]

export const PASSWORD_MIN_LENGTH = 10
