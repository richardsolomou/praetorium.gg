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

/** RFC 4180 records; a quote inside an unquoted field is kept as text. */
export function parseCsv(text: string) {
  const records: string[][] = []
  let record: string[] = []
  let field = ''
  let quoted = false
  let index = text.charCodeAt(0) === 0xfeff ? 1 : 0
  for (; index < text.length; index++) {
    const char = text[index]!
    if (quoted) {
      if (char !== '"') field += char
      else if (text[index + 1] === '"') {
        field += '"'
        index++
      } else quoted = false
    } else if (char === '"' && field === '') quoted = true
    else if (char === ',') {
      record.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index++
      record.push(field)
      records.push(record)
      record = []
      field = ''
    } else field += char
  }
  if (field !== '' || record.length) records.push([...record, field])
  return records.filter((row) => row.some((value) => value.trim() !== ''))
}
