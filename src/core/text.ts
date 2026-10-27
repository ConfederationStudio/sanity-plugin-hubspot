const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

/** Decodes HTML entities: the few named ones HubSpot's editor writes, and every numeric one. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body: string) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : Number(body.slice(1))
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : entity
    }
    return NAMED[body.toLowerCase()] ?? entity
  })
}

/** Plain text from HubSpot's HTML: tags dropped, entities decoded, spaces collapsed. */
export function plainText(html: string | undefined): string {
  if (!html) return ''
  return decodeEntities(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim()
}

/** Whether a string is an absolute http(s) address: the only kind a redirect may go to. */
export function isHttpUrl(value: string): boolean {
  if (!URL.canParse(value)) return false
  const {protocol} = new URL(value)
  return protocol === 'https:' || protocol === 'http:'
}
