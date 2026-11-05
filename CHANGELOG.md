# Changelog

Until 1.0, a minor version may change the API. Each change that needs work on a site or Studio says what to do.

## 0.1.0 (2026-11-05)

The first release.

- **Studio:** the `hubspot()` plugin, with a `hubspot.form` field and rich-text block, a searchable picker, a copy of each picked form, the `hubspot.page` field, `hubspot.chat` and `hubspot.openChat` for rich text, a publish warning, and the HubSpot tab.
- **Site, `/server`:** `hubspotRoutes()`, the route the Studio calls, with a Service Key from the environment or one pasted in the Studio and sealed; `submitForm` to send from the server; `HUBSPOT_FORM_PROJECTION` and `resolveContentType`.
- **Site, `/react`:** `<HubSpotForm>`, drawn in your components, sent from the browser or a server action, with follow-up fields, hidden fields, consent and a honeypot; `<HubSpotEmbed>` for forms the site can't draw, in HubSpot's current or legacy embed; `<HubSpotTracker>`; `<HubSpotChat>`, `<HubSpotChatEmbed>` and `<HubSpotChatLink>`.
- Form copies are read as a page's query returns them: the types Sanity TypeGen writes fit, and the marks visual editing adds in draft mode are dropped.
