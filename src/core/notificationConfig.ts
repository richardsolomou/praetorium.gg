/** What a player who has never answered gets. Nothing reaches a device the player has not allowed at the system prompt. */
export const DEFAULT_PUSH_NOTIFICATIONS = true

/** Devices one account keeps; registering another forgets the one seen longest ago. */
export const PUSH_TOKENS_PER_USER = 10

export const PUSH_PLATFORMS = ['ios', 'android'] as const
