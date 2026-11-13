/** Account fields beyond Better Auth's own, declared once so the server and the client agree on them. */
export const PLAYER_FIELDS = {
  colour: { type: 'string', required: false },
} as const
