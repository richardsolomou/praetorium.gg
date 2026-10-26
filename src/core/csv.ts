/** Spreadsheet applications run a cell that starts with one of these as a formula. */
const FORMULA = /^[=+\-@\t\r]/

function cell(value: string | number) {
  const text = typeof value === 'number' ? String(value) : FORMULA.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/** RFC 4180 text whose cells a spreadsheet shows rather than runs. */
export function csv(records: readonly (readonly (string | number)[])[]) {
  return records.map((record) => record.map(cell).join(',')).join('\r\n') + '\r\n'
}
