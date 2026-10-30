'use client'

import {createContext, useContext, useSyncExternalStore, type ReactNode} from 'react'

type Answer = 'unasked' | 'allowed' | 'refused'

const KEY = 'test-site:consent'
const ConsentContext = createContext<Answer>('unasked')

// The answer lives in localStorage, with a copy here for when storage is blocked.
let chosen: Answer | undefined
const listeners = new Set<() => void>()

function read(): Answer {
  if (chosen) return chosen
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'allowed' || saved === 'refused') return saved
  } catch {
    // Storage is blocked: the visitor is asked again on the next visit.
  }
  return 'unasked'
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function choose(next: Answer) {
  chosen = next
  try {
    localStorage.setItem(KEY, next)
  } catch {
    // As above.
  }
  for (const listener of listeners) listener()
}

/** A stand-in for a site's consent manager. The answer is kept in the browser. */
export function ConsentProvider({children}: {children: ReactNode}) {
  const answer = useSyncExternalStore(subscribe, read, () => 'unasked' as const)
  return (
    <ConsentContext value={answer}>
      {children}
      <aside data-consent={answer}>
        <span>Tracking and chat: {answer}</span>
        <button type="button" disabled={answer === 'allowed'} onClick={() => choose('allowed')}>
          Allow
        </button>
        <button type="button" disabled={answer === 'refused'} onClick={() => choose('refused')}>
          Refuse
        </button>
      </aside>
    </ConsentContext>
  )
}

/** Whether the visitor allowed tracking and chat. */
export const useConsent = (): boolean => useContext(ConsentContext) === 'allowed'
