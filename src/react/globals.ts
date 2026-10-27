/** What HubSpot's scripts put on `window`, typed for the calls the plugin makes. */

export interface HubSpotChatWidget {
  load(options?: {widgetOpen?: boolean}): void
  refresh(options?: {openToNewThread?: boolean}): void
  open(): void
  close(): void
  remove(): void
  status(): {loaded: boolean}
}

export interface HubSpotConversations {
  widget: HubSpotChatWidget
  clear(options?: {resetWidget?: boolean}): void
}

export interface HubSpotChatSettings {
  loadImmediately?: boolean
  inlineEmbedSelector?: string
  enableWidgetCookieBanner?: boolean | 'ON_WIDGET_LOAD' | 'ON_EXIT_INTENT'
}

interface HubSpotLegacyForms {
  forms: {
    create(options: {portalId: string; formId: string; region?: string; target: string}): void
  }
}

export interface HubSpotWindow extends Window {
  _hsq?: unknown[][]
  _hsp?: unknown[][]
  hsConversationsSettings?: HubSpotChatSettings
  hsConversationsOnReady?: (() => void)[]
  HubSpotConversations?: HubSpotConversations
  hbspt?: HubSpotLegacyForms
}

export const hubspotWindow = (): HubSpotWindow => window

/** One of HubSpot's command queues. Calls wait in it until the script loads. */
export function queue(name: '_hsq' | '_hsp'): unknown[][] {
  const w = hubspotWindow()
  w[name] ??= []
  return w[name]
}

const scripts = new Map<string, Promise<void>>()

function inject(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.addEventListener('load', () => resolve())
    script.addEventListener('error', () => reject(new Error(`Couldn’t load ${src}`)))
    document.head.append(script)
  })
}

/**
 * Loads a script once. With `again`, a script that has loaded runs once more when `again`
 * says so, for a loader that only looks for its targets as it runs.
 */
export function loadScript(src: string, again?: () => boolean): Promise<void> {
  const known = scripts.get(src)
  if (known) return again ? known.then(() => (again() ? inject(src) : undefined)) : known
  const loading = inject(src)
  scripts.set(src, loading)
  loading.catch(() => scripts.delete(src))
  return loading
}
