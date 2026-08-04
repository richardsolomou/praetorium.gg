import crypto from 'node:crypto'

/** Invite links are the only credential in the app; 128 bits keeps them unguessable and short. */
export function createToken() {
  return crypto.randomBytes(16).toString('base64url')
}

export function createId() {
  return crypto.randomBytes(8).toString('base64url')
}
