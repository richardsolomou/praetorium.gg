import type { LoggedCommand } from '../core/battle'

export type BattleWorkspace = {
  battle: { id: string; token: string; createdAt: number }
  players: { id: string; name: string; image?: string | null; side: number; automated: boolean }[]
  log: LoggedCommand[]
  serverSeq: number
  serverNow: number
}
