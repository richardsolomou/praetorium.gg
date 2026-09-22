const TAGS = /<\/?(?:b|i|u|k|ul|li|table|tbody|tr|td|th|appref)>/g

const clean = (markup: string) =>
  markup
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .split('')
    .filter((character) => {
      const code = character.charCodeAt(0)
      return (code > 31 && code !== 127) || character === '\n' || character === '\t'
    })
    .join('')

/** The known source markup as searchable text, without treating arbitrary angle-bracketed words as HTML. */
export function referenceText(markup: string): string {
  return clean(markup)
    .replaceAll(/<li>/g, '\n- ')
    .replaceAll(/<\/li>/g, '')
    .replaceAll(/<\/?(?:tr)>/g, '\n')
    .replaceAll(/<\/?(?:td|th)>/g, ' | ')
    .replaceAll(TAGS, '')
    .replaceAll(/\*{1,3}([^*\n]+)\*{1,3}/g, '$1')
    .replaceAll(/[ \t]+\n/g, '\n')
    .replaceAll(/\n[ \t]+/g, '\n')
    .replaceAll(/\n{3,}/g, '\n\n')
    .trim()
}

export function referenceMarkdown(markup: string): string {
  return clean(markup)
    .replaceAll('<b>', '**')
    .replaceAll('</b>', '**')
    .replaceAll('<i>', '*')
    .replaceAll('</i>', '*')
    .replaceAll(/<\/?u>/g, '')
    .replaceAll('<k>', '`')
    .replaceAll('</k>', '`')
    .replaceAll(/<li>/g, '\n- ')
    .replaceAll(/<\/li>/g, '')
    .replaceAll(/<\/?(?:ul|table|tbody|appref)>/g, '')
    .replaceAll(/<\/?tr>/g, '\n')
    .replaceAll(/<\/?(?:td|th)>/g, ' | ')
    .replaceAll(/\n{3,}/g, '\n\n')
    .trim()
}
