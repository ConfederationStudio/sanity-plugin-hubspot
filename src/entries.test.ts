import {existsSync, readFileSync} from 'node:fs'
import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

import {describe, expect, it} from 'vitest'

const SRC = dirname(fileURLToPath(import.meta.url))
const IMPORT = /(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g

/** Every package an entry reaches, following its own files, type imports included. */
function packagesReached(entry: string): Set<string> {
  const packages = new Set<string>()
  const seen = new Set<string>()
  const visit = (file: string) => {
    if (seen.has(file)) return
    seen.add(file)
    for (const match of readFileSync(file, 'utf8').matchAll(IMPORT)) {
      const specifier = match[1] ?? match[2]
      if (!specifier) continue
      if (!specifier.startsWith('.')) {
        packages.add(specifier)
        continue
      }
      const base = resolve(dirname(file), specifier)
      const found = ['.ts', '.tsx', '/index.ts']
        .map((end) => base + end)
        .find((path) => existsSync(path))
      if (found) visit(found)
    }
  }
  visit(resolve(SRC, entry))
  return packages
}

const isSanity = (name: string) =>
  name === 'sanity' || name.startsWith('sanity/') || name.startsWith('@sanity/')

describe('entry points', () => {
  it('keeps Sanity out of the site’s entries', () => {
    expect([...packagesReached('react/index.ts')].filter(isSanity)).toEqual([])
    expect([...packagesReached('server/index.ts')].filter(isSanity)).toEqual([])
  })

  it('keeps React out of the server entry', () => {
    expect(
      [...packagesReached('server/index.ts')].filter((name) => name.startsWith('react')),
    ).toEqual([])
  })

  it('keeps the shared core free of both', () => {
    expect([...packagesReached('core/index.ts')]).toEqual([])
  })
})
