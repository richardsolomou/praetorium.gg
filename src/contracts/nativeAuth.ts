/** A PKCE verifier or challenge as native sign-in sends it: 32 random bytes, base64url without padding. */
export const PKCE_VALUE = /^[\w-]{43}$/
