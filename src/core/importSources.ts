/** The trackers whose battles can be brought in, each recording its players by its own account id. */
export const IMPORT_SOURCES = ['battlebase'] as const
export type ImportSource = (typeof IMPORT_SOURCES)[number]

/** One player on one tracker, as the key of the battles they sat in and of the Praetorium account they proved is theirs. */
export const externalPlayerKey = (source: ImportSource, playerId: string) => JSON.stringify([source, playerId])
