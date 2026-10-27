import {
  useEffect,
  useLayoutEffect,
  useRef,
  type AnchorHTMLAttributes,
  type HTMLAttributes,
  type MouseEvent,
} from 'react'

import {hubspotWindow, type HubSpotConversations} from './globals'

/** Where an inline chat draws: the element `<HubSpotChatEmbed>` renders. */
export const HUBSPOT_INLINE_CHAT_ID = 'hubspot-chat-inline'

function whenChatReady(callback: (chat: HubSpotConversations) => void): void {
  const w = hubspotWindow()
  if (w.HubSpotConversations) return callback(w.HubSpotConversations)
  w.hsConversationsOnReady ??= []
  w.hsConversationsOnReady.push(() => {
    if (w.HubSpotConversations) callback(w.HubSpotConversations)
  })
}

/** Opens HubSpot's chat. False when it isn't loaded, so a link can go to its fallback instead. */
export function openHubSpotChat(): boolean {
  const widget = hubspotWindow().HubSpotConversations?.widget
  if (!widget?.status().loaded) return false
  widget.open()
  return true
}

export interface HubSpotChatProps {
  /** Hides chat on this page: the `hubspot.page` field's `hideChat`. */
  hidden?: boolean
  /** Draws the chat inside the page, where `<HubSpotChatEmbed>` is, instead of as a bubble. */
  inline?: boolean
  /** The page's path. A change has the widget follow, for single-page apps. */
  path?: string
  /** False when the visitor withdraws consent: the chat forgets them and goes. Default: true. */
  consent?: boolean
}

/**
 * Controls HubSpot's chat, which the tracking script brings, through its widget SDK. Chatflows,
 * bots and office hours stay in HubSpot. Place it next to `<HubSpotTracker>`.
 */
export function HubSpotChat({
  hidden = false,
  inline = false,
  path,
  consent = true,
}: HubSpotChatProps) {
  const last = useRef<{inline: boolean} | null>(null)

  // Before the tracker's effect loads the script, so the widget waits to be told.
  useLayoutEffect(() => {
    const w = hubspotWindow()
    w.hsConversationsSettings = {
      ...w.hsConversationsSettings,
      loadImmediately: false,
      inlineEmbedSelector: inline ? `#${HUBSPOT_INLINE_CHAT_ID}` : undefined,
    }
  }, [inline])

  useEffect(() => {
    let live = true
    whenChatReady((chat) => {
      if (!live) return
      const {widget} = chat
      if (!consent) {
        chat.clear({resetWidget: true})
        widget.remove()
        last.current = null
        return
      }
      if (hidden) {
        widget.remove()
        last.current = null
        return
      }
      // HubSpot allows one load or refresh a second, so each page makes one call.
      if (!widget.status().loaded) widget.load()
      else if (last.current?.inline !== inline) {
        widget.remove()
        widget.load()
      } else widget.refresh()
      last.current = {inline}
    })
    return () => {
      live = false
    }
  }, [consent, hidden, inline, path])

  return null
}

/** Where an inline chat draws. Pair it with `<HubSpotChat inline />`. */
export function HubSpotChatEmbed(props: Omit<HTMLAttributes<HTMLDivElement>, 'id'>) {
  return <div {...props} id={HUBSPOT_INLINE_CHAT_ID} />
}

export interface HubSpotChatLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  /** Where the link goes when chat can't open, such as before consent. */
  fallbackUrl?: string
}

/** An "Open chat" link: the `hubspot.openChat` annotation. */
export function HubSpotChatLink({fallbackUrl, onClick, children, ...anchor}: HubSpotChatLinkProps) {
  return (
    <a
      {...anchor}
      href={fallbackUrl ?? '#'}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event)
        if (event.defaultPrevented) return
        if (openHubSpotChat() || !fallbackUrl) event.preventDefault()
      }}
    >
      {children}
    </a>
  )
}
