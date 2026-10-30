/** A PKCE verifier or challenge as native sign-in sends it: 32 random bytes, base64url without padding. */
export const PKCE_VALUE = /^[\w-]{43}$/

/** Query parameters that report a native sign-in's outcome to the page that resumes it. */
export const NATIVE_AUTH_SUCCESS_QUERY = '__native_auth'
export const NATIVE_AUTH_ERROR_QUERY = '__native_auth_error'
