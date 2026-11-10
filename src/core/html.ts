import {decodeEntities} from './text'

/**
 * Cleans HubSpot's HTML before a page draws it. A form copy is a public document any editor of
 * the project can rewrite, so its HTML is never trusted as it stands.
 *
 * Nothing is stripped from the input: the output is written afresh, from the short list of tags
 * below, with text escaped. A link keeps its address and whether it opens a new tab; nothing
 * else keeps an attribute, so styles, classes and handlers go. Images go too.
 */

/** Tags that hold running text. */
const INLINE = new Set([
  'a',
  'b',
  'strong',
  'i',
  'em',
  'u',
  's',
  'span',
  'sub',
  'sup',
  'small',
  'code',
  'br',
])
/** Blocks that hold running text only: opening any block ends them. */
const PARAGRAPH = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
/** Blocks that hold other blocks. */
const CONTAINER = new Set(['ul', 'ol', 'li', 'blockquote'])
/** Tags dropped with everything inside them. Any other unknown tag is dropped and its text kept. */
const DROPPED = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'noscript',
  'template',
  'svg',
  'math',
  'textarea',
  'title',
  'select',
  'xmp',
  'noembed',
  'noframes',
  'plaintext',
])
const SCHEMES = new Set(['http', 'https', 'mailto', 'tel'])

/** `&`, unless it starts an entity, and the two brackets. */
const TEXT = /[<>]|&(?!(?:#\d{1,7}|#x[0-9a-f]{1,6}|[a-z][a-z0-9]{1,31});)/gi
const ESCAPED: Record<string, string> = {'<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;'}

const escapeText = (text: string): string => text.replace(TEXT, (found) => ESCAPED[found] ?? found)
const escapeAttribute = (value: string): string =>
  value.replace(/[<>&"]/g, (found) => ESCAPED[found] ?? found)

const isSpace = (char: string | undefined): boolean =>
  char === ' ' || char === '\t' || char === '\n' || char === '\r' || char === '\f'
const isLetter = (char: string | undefined): boolean => char !== undefined && /^[a-z]$/i.test(char)

type Tag =
  /** A comment, a doctype or anything else that draws nothing. */
  | {kind: 'nothing'; end: number}
  | {kind: 'open' | 'close'; end: number; name: string; attributes: Map<string, string>}
  /** No tag starts here: the `<` is text. */
  | {kind: 'text'}
  /** A tag starts here and never ends, so nothing after it can be a tag either. */
  | {kind: 'unended'}

/** What starts at `from`, where the input has a `<`. */
function readTag(html: string, from: number): Tag {
  const upTo = (text: string, start: number): number => {
    const found = html.indexOf(text, start)
    return found === -1 ? html.length : found + text.length
  }
  if (html.startsWith('<!--', from)) return {kind: 'nothing', end: upTo('-->', from + 2)}
  const next = html[from + 1]
  if (next === '!' || next === '?') return {kind: 'nothing', end: upTo('>', from)}
  const closing = next === '/'
  let at = from + (closing ? 2 : 1)
  if (!isLetter(html[at])) return closing ? {kind: 'nothing', end: upTo('>', from)} : {kind: 'text'}

  const word = (stops: string): string => {
    const start = at
    while (at < html.length && !isSpace(html[at]) && !stops.includes(html[at] ?? '')) at++
    return html.slice(start, at)
  }
  const name = word('/>').toLowerCase()
  const attributes = new Map<string, string>()
  while (at < html.length) {
    while (isSpace(html[at]) || html[at] === '/') at++
    if (html[at] === '>') return {kind: closing ? 'close' : 'open', end: at + 1, name, attributes}
    if (at >= html.length) break
    // A name may begin with `=`, as a browser reads it; it then holds no value.
    const start = at++
    word('/>=')
    const attribute = html.slice(start, at).toLowerCase()
    while (isSpace(html[at])) at++
    let value = ''
    if (html[at] === '=') {
      at++
      while (isSpace(html[at])) at++
      const quote = html[at]
      if (quote === '"' || quote === "'") {
        const end = html.indexOf(quote, at + 1)
        if (end === -1) break
        value = html.slice(at + 1, end)
        at = end + 1
      } else value = word('>')
    }
    // As in a browser, the first of two attributes with one name is the one that counts.
    if (!attributes.has(attribute)) attributes.set(attribute, value)
  }
  return {kind: 'unended'}
}

/** Where a dropped element ends: after its closing tag, or at the end without one. */
function afterElement(html: string, name: string, from: number): number {
  const close = new RegExp(`</${name}(?=[\\s/>])`, 'gi')
  close.lastIndex = from
  const found = close.exec(html)
  if (!found) return html.length
  const end = html.indexOf('>', found.index)
  return end === -1 ? html.length : end + 1
}

/** Text without the spaces and control characters at its ends, which a browser drops from an address. */
function trimmed(text: string): string {
  let start = 0
  let end = text.length
  while (start < end && text.charCodeAt(start) <= 0x20) start++
  while (end > start && text.charCodeAt(end - 1) <= 0x20) end--
  return text.slice(start, end)
}

/**
 * A link's address as a browser will read it, or undefined when it mustn't be followed. Web, mail
 * and phone addresses pass, and so does one with no scheme, which a browser reads as a web
 * address.
 */
function safeAddress(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  // A browser drops tabs and line breaks anywhere in an address.
  const address = trimmed(decodeEntities(value).replace(/[\t\n\r]/g, ''))
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(address)?.[1]
  return scheme === undefined || SCHEMES.has(scheme.toLowerCase()) ? address : undefined
}

function linkTag(attributes: Map<string, string>): string {
  const address = safeAddress(attributes.get('href'))
  const newTab = attributes.get('target')?.trim().toLowerCase() === '_blank'
  // The address is written as it was checked: decoded, then escaped once.
  return `<a${address === undefined ? '' : ` href="${escapeAttribute(address)}"`}${
    newTab ? ' target="_blank" rel="noopener noreferrer"' : ''
  }>`
}

/**
 * HubSpot's HTML, safe to draw: text, emphasis, links, headings, lists and quotes. The output is
 * well formed, every tag closed in order, so it can't reach past the element it is drawn in.
 * Cleaning what is already clean changes nothing.
 */
export function cleanHtml(html: string): string {
  let out = ''
  /** The tags open now, each with where its own tag starts and ends in `out`. */
  const open: {name: string; start: number; end: number}[] = []
  /** How many of each are open, so a closing tag with no match costs nothing to tell. */
  const counts = new Map<string, number>()
  const top = (): string | undefined => open.at(-1)?.name

  const closeTop = () => {
    const tag = open.pop()
    if (!tag) return
    counts.set(tag.name, (counts.get(tag.name) ?? 1) - 1)
    // A tag that held nothing is taken out again, unless it is a list or a quote.
    if (out.length === tag.end && !CONTAINER.has(tag.name)) out = out.slice(0, tag.start)
    else out += `</${tag.name}>`
  }
  const closeThrough = (name: string) => {
    if (!counts.get(name)) return
    while (top() !== name) closeTop()
    closeTop()
  }
  const openTag = (name: string, attributes: Map<string, string>) => {
    if (name === 'br') {
      out += '<br>'
      return
    }
    if (INLINE.has(name)) {
      // A link never holds another.
      if (name === 'a') closeThrough('a')
    } else {
      // A block ends the running text before it, as a browser would have it.
      while (INLINE.has(top() ?? '') || PARAGRAPH.has(top() ?? '')) closeTop()
      if (name === 'li') {
        if (top() === 'li') closeTop()
        // An item belongs to a list; outside one, only its text is kept.
        if (top() !== 'ul' && top() !== 'ol') return
      }
    }
    const start = out.length
    out += name === 'a' ? linkTag(attributes) : `<${name}>`
    open.push({name, start, end: out.length})
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }

  let at = 0
  while (at < html.length) {
    const bracket = html.indexOf('<', at)
    if (bracket === -1) {
      out += escapeText(html.slice(at))
      break
    }
    out += escapeText(html.slice(at, bracket))
    const tag = readTag(html, bracket)
    if (tag.kind === 'unended') {
      out += escapeText(html.slice(bracket))
      break
    }
    if (tag.kind === 'text') {
      out += '&lt;'
      at = bracket + 1
      continue
    }
    at = tag.end
    if (tag.kind === 'nothing') continue
    // HubSpot's editor writes paragraphs; a `div` is drawn as one.
    const name = tag.name === 'div' ? 'p' : tag.name
    if (tag.kind === 'close') {
      closeThrough(name)
      continue
    }
    if (DROPPED.has(name)) at = afterElement(html, name, tag.end)
    else if (INLINE.has(name) || PARAGRAPH.has(name) || CONTAINER.has(name))
      openTag(name, tag.attributes)
  }
  while (open.length > 0) closeTop()
  return out
}
