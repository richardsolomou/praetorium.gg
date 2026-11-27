function serverApp(): never {
  throw new Error('A client test reached the server app: move it out of the client test project in vitest.config.ts')
}

export const app = serverApp
export const warm = serverApp
export const readiness = serverApp
