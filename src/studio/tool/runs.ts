import type {SyncResult} from '../copies'

/** One refresh of the copies, kept while the tab is open. */
export interface SyncRun {
  /** Counts up from the tab's first refresh, to tell two in the same minute apart. */
  id: number
  /** When it finished, as an ISO date. */
  at: string
  /** Whether every copy was rewritten, as Refresh all does, or only the ones behind. */
  all: boolean
  result: SyncResult
}

const copies = (count: number): string => (count === 1 ? '1 copy' : `${count} copies`)

/** What a refresh did, in a sentence. */
export function runSummary(result: SyncResult): string {
  const parts = [
    result.written > 0 && `${copies(result.written)} updated`,
    result.archived > 0 && `${copies(result.archived)} marked archived`,
    result.failed > 0 && `${copies(result.failed)} couldn’t be written`,
  ].filter(Boolean)
  return parts.length > 0 ? `${parts.join(', ')}.` : 'Every copy was already up to date.'
}

/** Whether a refresh did anything an editor should see. */
export const changedSomething = (result: SyncResult): boolean => result.changes.length > 0

/**
 * Whether a refresh is worth keeping in the tab's list: one an editor asked for, or one that
 * changed a copy. The quiet refresh on opening the tab isn't.
 */
export const isNotable = (run: Pick<SyncRun, 'all' | 'result'>): boolean =>
  run.all || changedSomething(run.result)

export function formatTime(iso: string | undefined): string | undefined {
  if (!iso || Number.isNaN(Date.parse(iso))) return undefined
  return new Intl.DateTimeFormat(undefined, {timeStyle: 'short'}).format(new Date(iso))
}
