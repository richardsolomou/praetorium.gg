/**
 * The three shapes a table can take, named once.
 *
 * A battle seats named people into a shape now; a league event fixes one for entrants
 * who have not arrived yet. Both name the same three things, so the name and the count
 * live here rather than being retyped at each surface.
 *
 * The count reads the table from outside it. Which side the opener sits on in a 2v1 is
 * a separate question, asked once by whoever is being seated — not a fourth shape.
 */
export const TABLE_SHAPES = ['1v1', '2v1', '2v2'] as const
export type TableShape = (typeof TABLE_SHAPES)[number]

export const TABLE_SHAPE_LABELS: Record<TableShape, { name: string; count: string }> = {
  '1v1': { name: 'Duel', count: '1 vs 1' },
  '2v1': { name: 'Solo vs pair', count: '2 vs 1' },
  '2v2': { name: 'Doubles', count: '2 vs 2' },
}
