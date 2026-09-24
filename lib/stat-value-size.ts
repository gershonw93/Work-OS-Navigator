/**
 * How big a StatStrip number can be and still fit its cell.
 *
 * THE BUG. Master Money on a phone printed "$18,769,451" as "$18,769,45" over
 * a lone "1", and "$9,056,478" ran under the cell beside it. A strip is two
 * cells across a 390px screen - about 130px of text each - and `text-2xl` bold
 * holds roughly eight characters in that. Money past a million is ten or
 * eleven.
 *
 * A number is never truncated or wrapped: "$18,769,45" is a different amount,
 * not a shorter one. So the type steps DOWN instead, and it steps down for the
 * whole strip at once, sized off its LONGEST value - four cells in four sizes
 * reads as four different kinds of number.
 */
export function statValueSize(values: (string | number)[]): string {
  const longest = values.reduce<number>((n, v) => Math.max(n, String(v).length), 0)
  if (longest >= 10) return 'text-lg'
  if (longest >= 8) return 'text-xl'
  return 'text-2xl'
}
