# Changelog

Until 1.0, a minor version may change the API. Each change that needs work on a site or Studio says what to do.

## 0.1.1 (2026-11-10)

Two security fixes. A form copy is a public document that anyone who can write to the dataset can rewrite, and the site trusted what it read from one.

- **HubSpot's HTML is cleaned before it is drawn.** A rewritten copy could put a script on the page through a row's text, a field's description, the consent or the thank-you. That HTML is now cleaned when the route reads a form, when the site reads a copy and as the plain components draw it, and a thank-you answered by your own server action is cleaned too. Text, emphasis, links, headings, lists and quotes are kept. Scripts, inline styles, classes, images, event handlers and `javascript:` links are dropped, and a `div` is drawn as a paragraph. If you relied on HubSpot's inline styles or images in rich text, style the form in your own CSS instead.
- **A copy can't send what visitors enter to another HubSpot account.** `submitForm`, `sendHubSpotForm`, `<HubSpotForm>` and `<HubSpotEmbed>` take a `portalId`, your HubSpot account id: a copy that names another account draws nothing and is sent nowhere. Set it wherever you draw or send a form.
- `submitForm` with a `token` and no `portalId` now checks the form against the key's own account, asked of HubSpot once per key. Nothing is sent while HubSpot can't say whose key it is, so a revoked key no longer falls back to the public endpoint by itself: set `portalId`, and it does again.
- A field's description is drawn through the form's `RichText` component, with `kind="description"`. Field components get `RichText` as a prop; a description now sits in a `[data-hubspot-text="description"]` element inside `[data-hubspot-description]`.
- A copy's redirect after a send is followed only to an `http` or `https` address.

The HubSpot tab is rebuilt. Nothing to do in your Studio.

- **Forms:** how many forms are in use, need attention and are drawn by your site; a search by name or form id, and filters; each form opens to its fields, consent, what happens after a send, whether its copy is up to date, and the documents it is on, with links to edit it and see its submissions in HubSpot and a refresh of that one form.
- **Tracking and chat:** the content type each document type is filed under, the pages that set their own, and the pages that hide chat.
- **Setup:** a checklist of what the Studio needs to list HubSpot's forms, which names the step that failed and what to do; the key form, which now asks before removing a key; and what each refresh changed since the tab was opened.
- The header links to the account's forms, contacts, reports and chat in HubSpot.

## 0.1.0 (2026-11-06)

The first release.

- **Studio:** the `hubspot()` plugin, with a `hubspot.form` field and rich-text block, a searchable picker, a copy of each picked form, the `hubspot.page` field, `hubspot.chat` and `hubspot.openChat` for rich text, a publish warning, and the HubSpot tab.
- **Site, `/server`:** `hubspotRoutes()`, the route the Studio calls, with a Service Key from the environment or one pasted in the Studio and sealed; `submitForm` to send from the server; `HUBSPOT_FORM_PROJECTION` and `resolveContentType`.
- **Site, `/react`:** `<HubSpotForm>`, drawn in your components, sent from the browser or a server action, with follow-up fields, hidden fields, consent and a honeypot; `<HubSpotEmbed>` for forms the site can't draw, in HubSpot's current or legacy embed; `<HubSpotTracker>`; `<HubSpotChat>`, `<HubSpotChatEmbed>` and `<HubSpotChatLink>`.
- Form copies are read as a page's query returns them: the types Sanity TypeGen writes fit, and the marks visual editing adds in draft mode are dropped.
