import { integer } from 'drizzle-orm/sqlite-core'

export const date = (name: string) => integer(name, { mode: 'timestamp_ms' })
export const flag = (name: string) => integer(name, { mode: 'boolean' })
