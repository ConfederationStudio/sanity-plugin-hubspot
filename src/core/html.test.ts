// @vitest-environment jsdom
import {describe, expect, it} from 'vitest'

import {cleanHtml} from './html'

/**
 * The cleaner against a real HTML parser: whatever goes in, what comes out is read by a browser
 * as the allowed tags only, stays inside the element it is drawn in, and follows no script.
 */

const ALLOWED = new Set(
  'a b strong i em u s span sub sup small code br p h1 h2 h3 h4 h5 h6 ul ol li blockquote'.split(
    ' ',
  ),
)
const SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:'])

/** Pieces of markup that trip parsers: tags left open, raw text, tables, forms, half-written tags. */
const PIECES = [
  '<p>',
  '</p>',
  '<div>',
  '</div>',
  '<b>',
  '</b>',
  '<i>',
  '</i>',
  '<span>',
  '</span>',
  '<ul>',
  '</ul>',
  '<ol>',
  '<li>',
  '</li>',
  '<blockquote>',
  '</blockquote>',
  '<h2>',
  '</h2>',
  '<br>',
  '<a href="javascript:alert(1)">',
  '<a href=\'/x\' target="_blank">',
  '<a href=" &#106;avascript:alert(1)" onclick="alert(1)">',
  '<a href="data:text/html,x">',
  '</a>',
  '<script>',
  '</script>',
  '<style>',
  '</style>',
  '<svg>',
  '</svg>',
  '<math>',
  '<img src=x onerror=alert(1)>',
  '<table>',
  '<tr>',
  '<td>',
  '</table>',
  '<form>',
  '</form>',
  '<select>',
  '<option>',
  '</select>',
  '<textarea>',
  '</textarea>',
  '<template>',
  '<noscript>',
  '</noscript>',
  '<title>',
  '</title>',
  '<plaintext>',
  '<xmp>',
  '<iframe>',
  '<button>',
  '</button>',
  '<label>',
  '</label>',
  '<input>',
  '<body onload=alert(1)>',
  '</body>',
  '</html>',
  '<frameset>',
  '<!--',
  '-->',
  '<![CDATA[',
  '<?x',
  '<a ',
  '<p ',
  '<span',
  'href=',
  'style="x"',
  'onclick=alert(1)',
  'javascript:alert(1)',
  '<',
  '>',
  '"',
  "'",
  '=',
  '/',
  ' ',
  '\n',
  '\t',
  '&',
  '&lt;',
  '&#x3C;',
  '&amp;',
  'text',
]

/** The same numbers every run, so a failure can be found again. */
function random(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296
    return state / 4_294_967_296
  }
}

/** Cleaned HTML as a server would send it: each inside a form's label, with the page going on after. */
function drawn(cleaned: readonly string[]): Element[] {
  const sections = cleaned.map(
    (html) =>
      `<section><form><label><div class="drawn">${html}</div></label><p class="after">after</p></form></section>`,
  )
  const page = new DOMParser().parseFromString(
    `<!doctype html><body>${sections.join('')}</body>`,
    'text/html',
  )
  return [...page.body.children]
}

/** What a browser made of one cleaned input that it shouldn't have, in words. */
function problems(section: Element | undefined, output: string): string[] {
  const found: string[] = []
  const form = section?.firstElementChild
  const [label, after] = form?.children ?? []
  const place = label?.firstElementChild
  // The page around it is as it was: nothing closed early, nothing moved out.
  if (
    section?.tagName !== 'SECTION' ||
    section.children.length !== 1 ||
    form?.tagName !== 'FORM' ||
    form.children.length !== 2 ||
    label?.tagName !== 'LABEL' ||
    label.children.length !== 1 ||
    place?.className !== 'drawn' ||
    after?.className !== 'after' ||
    after.textContent !== 'after' ||
    section.textContent !== `${place.textContent}after`
  )
    return ['it reached past the element it was drawn in']

  const elements = [...place.querySelectorAll('*')]
  for (const element of elements) {
    const tag = element.tagName.toLowerCase()
    if (!ALLOWED.has(tag)) found.push(`a ${tag} got through`)
    for (const {name} of element.attributes)
      if (tag !== 'a' || !['href', 'target', 'rel'].includes(name))
        found.push(`${name} got through on a ${tag}`)
    const address = element.getAttribute('href')
    if (address !== null && !SCHEMES.has(new URL(address, 'https://site.test/').protocol))
      found.push(`a link goes to ${address}`)
  }
  // A browser has nothing to mend, so it reads back the tags as written.
  if (elements.length !== (output.match(/<[a-z][a-z0-9]*[ >]/g) ?? []).length)
    found.push('a browser read other tags than were written')
  if (cleanHtml(output) !== output) found.push('cleaning it again changed it')
  return found
}

describe('cleanHtml, read by a browser', () => {
  it('leaves only the allowed tags, inside the element they are drawn in', () => {
    const next = random(20261110)
    const failures: string[] = []
    for (let batch = 0; batch < 30; batch++) {
      const inputs = Array.from({length: 100}, () =>
        Array.from(
          {length: 1 + Math.floor(next() * 14)},
          () => PIECES[Math.floor(next() * PIECES.length)],
        ).join(''),
      )
      const outputs = inputs.map(cleanHtml)
      const sections = drawn(outputs)
      // One input reaching out of its section would shift every one after it.
      if (sections.length !== inputs.length) failures.push(`batch ${batch} came apart`)
      for (const [index, input] of inputs.entries()) {
        const output = outputs[index] ?? ''
        for (const problem of problems(sections[index], output))
          failures.push(`${JSON.stringify(input)} became ${JSON.stringify(output)}: ${problem}`)
      }
    }
    expect(failures).toEqual([])
  }, 30_000)
})
