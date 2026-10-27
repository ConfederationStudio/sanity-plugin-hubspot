# sanity-plugin-hubspot

HubSpot forms, tracking, page content types and live chat for Sanity. Editors pick a HubSpot form by name in the Studio; the site draws it in its own design and sends it to HubSpot.

> **Status:** in development, not yet on npm. A 0.x is published once a test Studio and one real site both work. Version 1 targets Sanity Studio 6 and React 19.2.

- **Forms.** A `hubspot.form` field and rich-text block with a searchable picker. The Studio keeps a copy of each picked form (like Mux keeps a document per video), so a page reads its form with its own GROQ query and draws it with `<HubSpotForm>`, in your components. Follow-up fields, hidden fields, consent and a honeypot are built in. A form the site can't draw (reCAPTCHA, a file upload, a payment) falls back to HubSpot's embed.
- **Tracking.** `<HubSpotTracker>` loads HubSpot's script only after consent, counts page changes in single-page apps, stays off in draft mode, and files each page view under a content type.
- **Chat.** `<HubSpotChat>` controls HubSpot's chat widget per page, inline in a section, or from an "Open chat" link.
- **A HubSpot tab** in the Studio: the connection, the forms in use that need attention, and every form with the documents it is on.

## How it fits together

The Studio never calls HubSpot itself: HubSpot's API refuses calls from a browser, and the key must stay secret. It calls one route on your site, signed in as the editor, and the route calls HubSpot. Pages read the form copies with their query, and go to HubSpot directly to send forms and load the tracking script.

```
Studio ──(editor's Sanity token)──▶ your site's /api/hubspot ──(HubSpot key)──▶ HubSpot API
   │                                                                              ▲
   └─ writes form copies ─▶ Sanity ◀─ page query ─ your site ─ sends forms ───────┘
```

## Install

```bash
npm i sanity-plugin-hubspot
```

The Studio and the site install the same package. The site imports `sanity-plugin-hubspot/react` and `sanity-plugin-hubspot/server`, which never import Sanity, so a site without a Studio doesn't need it.

## Quick start

### 1. The Studio

```ts
// sanity.config.ts
import {defineConfig} from 'sanity'
import {hubspot} from 'sanity-plugin-hubspot'

export default defineConfig({
  // …
  plugins: [
    hubspot({
      api: 'https://www.example.com/api/hubspot',
      contentTypes: {post: 'blog-post', campaign: 'landing-page'},
    }),
  ],
})
```

Then use the types in your schema:

```ts
defineField({name: 'form', type: 'hubspot.form'})

// A site's own one-field form: the picker says which HubSpot forms take it.
defineField({name: 'newsletter', type: 'hubspot.form', options: {draws: ['email']}})

// Content type and "hide chat" per document.
defineField({name: 'hubspot', type: 'hubspot.page'})

// Rich text: a form block, an inline chat block and an "Open chat" link.
defineField({
  name: 'body',
  type: 'array',
  of: [
    {type: 'block', marks: {annotations: [{type: 'hubspot.openChat'}]}},
    {type: 'hubspot.form'},
    {type: 'hubspot.chat'},
  ],
})
```

### 2. The site's route

One route file. On Next.js:

```ts
// app/api/hubspot/[...path]/route.ts
import {hubspotRoutes} from 'sanity-plugin-hubspot/server'

export const {GET, POST, OPTIONS} = hubspotRoutes({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET,
  studioOrigins: ['https://example.sanity.studio', 'http://localhost:3333'],
  token: process.env.HUBSPOT_TOKEN,
  secretKey: process.env.HUBSPOT_SECRET_KEY,
})
```

The route takes a web `Request` and returns a `Response`, so the same handlers fit Remix, Astro, SvelteKit or Hono.

### 3. The key

Create a HubSpot **Service Key** with the `forms` scope, then either:

- set `HUBSPOT_TOKEN` in the site's environment, or
- set `HUBSPOT_SECRET_KEY` (any random string of 32 characters or more) and have an administrator paste the key in the Studio's HubSpot tab. The route checks it with HubSpot and seals it (AES-256-GCM) with the secret, and the Studio saves only the sealed text. Nobody can read it back.

### 4. The page

Read the form's copy with the page, and draw it:

```ts
import {HUBSPOT_FORM_PROJECTION} from 'sanity-plugin-hubspot/server'

const query = `*[_type == "page" && slug.current == $slug][0]{
  title,
  form${HUBSPOT_FORM_PROJECTION},
  hubspot
}`
```

```tsx
import {HubSpotForm} from 'sanity-plugin-hubspot/react'

;<HubSpotForm form={page.form?.definition} />
```

In a React Server Component, import plain helpers such as `HUBSPOT_FORM_PROJECTION` and `resolveContentType` from `/server`: everything in `/react` is client code.

## Data structure

A `hubspot.form` field holds the form's id and name, and a weak reference to its copy:

```json
{
  "_type": "hubspot.form",
  "formId": "3f0f3c1e-8d2a-4b8e-9c55-1a2b3c4d5e6f",
  "name": "Demo request",
  "definition": {
    "_type": "reference",
    "_ref": "hubspot-form-3f0f3c1e-8d2a-4b8e-9c55-1a2b3c4d5e6f",
    "_weak": true
  }
}
```

The copy is a `hubspot.formDefinition` document whose fields are the plugin's form model: its rows and fields, follow-ups, consent, thank-you, whether the site can draw it and why not, and when HubSpot last changed it. It holds none of HubSpot's other settings, such as notification recipients. Its id has no dot, so a page can read it without a token. The Studio rewrites it when an editor picks or refreshes the form and when the HubSpot tab opens. A form HubSpot no longer has is marked `archived`, never deleted, so pages that use it still point somewhere and the tab can flag them.

The pasted key, sealed, lives in a document with the id `hubspot.settings`. The dot keeps Sanity from serving it without a token.

## The front end

### Sending

Without a server, the browser sends straight to HubSpot's public endpoint, which allows cross-origin calls, so a static site works. To send from your server instead, which keeps HubSpot's spam checks and lets you add a bot check, pass a server action that calls `submitForm`:

```ts
// app/actions.ts
'use server'
import {headers} from 'next/headers'
import {formCopyId, postedFormId, submitForm} from 'sanity-plugin-hubspot/server'

import {client} from '@/sanity/client'

export async function sendForm(data: FormData) {
  const formId = postedFormId(data)
  // Read the form from Sanity, never from what the browser posted.
  const form = formId && (await client.fetch(`*[_id == $id][0]`, {id: formCopyId(formId)}))
  if (!form) return {status: 'failed' as const}
  // Your bot check goes here: Vercel BotID, Cloudflare Turnstile.
  return submitForm(form, data, {token: process.env.HUBSPOT_TOKEN, headers: await headers()})
}
```

```tsx
<HubSpotForm form={page.form?.definition} action={sendForm} inside={<Turnstile />} />
```

`submitForm` passes on HubSpot's tracking cookie (`hubspotutk`), the visitor's address and the page, so the contact is tied to their earlier visits.

### Your own components

`<HubSpotForm>`'s props follow `@sanity/form-toolkit`'s `FormRenderer`. `fieldComponents` maps each kind of field to your component; anything left out is drawn in plain HTML with `data-hubspot-*` attributes to style:

```tsx
<HubSpotForm
  form={definition}
  fieldComponents={{
    text: TextField,
    email: TextField,
    textarea: TextArea,
    select: Select,
    checkbox: Checkbox,
  }}
  components={{Group: Row, RichText: Prose, Consent: ConsentBlock, Submit: Button, Status: Notice}}
/>
```

Each field component gets `{field, fieldState, error, id}`. `field.name` is what the input posts under; `field.hasLabel` is false when HubSpot left the field unlabelled, and the label should then be for screen readers only.

The field kinds are `text`, `email`, `tel`, `number`, `date`, `textarea`, `select`, `radio`, `checkboxes` and `checkbox`.

### With a form library

`getFieldState` and `getFieldError` let a form library hold the values. Without them, the browser does.

A plain form:

```tsx
<HubSpotForm form={definition} />
```

react-hook-form:

```tsx
const {watch, setValue} = useForm()
const values = watch()

<HubSpotForm
  form={definition}
  getFieldState={(name) => ({value: values[name] ?? '', onChange: (value) => setValue(name, value)})}
/>
```

TanStack Form:

```tsx
const form = useForm({defaultValues: {} as Record<string, string | string[]>})
const values = useStore(form.store, (state) => state.values)

<HubSpotForm
  form={definition}
  getFieldState={(name) => ({value: values[name] ?? '', onChange: (value) => form.setFieldValue(name, value)})}
/>
```

Formik:

```tsx
const formik = useFormik({initialValues: {}, onSubmit: () => {}})

<HubSpotForm
  form={definition}
  getFieldState={(name) => ({
    value: formik.values[name] ?? '',
    onChange: (value) => formik.setFieldValue(name, value),
    onBlur: () => formik.setFieldTouched(name),
  })}
  getFieldError={(name) => (formik.touched[name] ? formik.errors[name] : undefined)}
/>
```

`<HubSpotForm>` still checks and sends the form itself; the library's errors, when it has any, win over HubSpot's.

### Forms the site can't draw

A form with reCAPTCHA on, a file upload, a payment field, a follow-up on a date window, or a legitimate interest the submit API can't record is shown with HubSpot's own embed (`<HubSpotEmbed>`), current or legacy as the form is set in HubSpot. The picker and the tab say which forms these are, and why. Progressive fields don't stop a form from being drawn; the site leaves them out.

### Tracking

```tsx
'use client'
import {usePathname} from 'next/navigation'
import {HubSpotChat, HubSpotTracker, resolveContentType} from 'sanity-plugin-hubspot/react'

export function HubSpot({page, consented, draft}) {
  const path = usePathname()
  return (
    <>
      <HubSpotTracker
        portalId="1234567"
        region="eu1"
        consent={consented}
        path={path}
        contentType={resolveContentType(page?.hubspot?.contentType, page?._type, {
          post: 'blog-post',
        })}
        disabled={draft}
      />
      <HubSpotChat hidden={page?.hubspot?.hideChat} path={path} consent={consented} />
    </>
  )
}
```

- Nothing loads until `consent` is true. When it turns false, HubSpot removes its cookies. `consent="hubspot"` loads the script at once and leaves consent to HubSpot's own cookie banner.
- `disabled` keeps editors out of the numbers in draft mode and Presentation previews.
- `createTracker()` makes the same calls without React.

### Chat

Chatflows, bots and office hours stay in HubSpot. On the site:

- `<HubSpotChat hidden>` hides the widget on a page (the `hubspot.page` field's `hideChat`).
- `<HubSpotChat inline />` with `<HubSpotChatEmbed />` draws the chat inside a section, for the `hubspot.chat` block.
- `<HubSpotChatLink fallbackUrl="/contact">` opens the chat, or goes to the fallback when chat can't open, for the `hubspot.openChat` annotation. `openHubSpotChat()` does the same from your own button.

## Options

### `hubspot()` in the Studio

| Option         |                                                                                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api`          | The site's route, such as `https://www.example.com/api/hubspot`, or `/api/hubspot` for a Studio on the site's own domain. Required.                                   |
| `contentTypes` | How each document type's page views are filed: `standard-page`, `landing-page`, `listing-page`, `blog-post` or `knowledge-article`. Pass the same map to the tracker. |
| `tool`         | `false` leaves out the HubSpot tab; `{name, title}` renames it.                                                                                                       |

### `hubspotRoutes()` on the site

| Option          |                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| `projectId`     | The Sanity project. Only its members get an answer, checked with Sanity on every new token. Required. |
| `dataset`       | Default `production`.                                                                                 |
| `studioOrigins` | The origins the Studio runs on. A Studio on the site's own domain needs none. Required.               |
| `token`         | A HubSpot Service Key. Wins over a pasted one.                                                        |
| `secretKey`     | Seals a key pasted in the Studio. At least 32 characters.                                             |
| `saveRoles`     | Roles that may paste or replace the key. Default `['administrator']`.                                 |
| `standIn`       | Answer with sample forms and call nobody: for a local Studio before there is a HubSpot account.       |

### `<HubSpotForm>`

| Prop                             |                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------ |
| `form`                           | The copy: `definition->` on a `hubspot.form` field.                                              |
| `action`                         | A server action that calls `submitForm`. Without it, the browser sends to HubSpot.               |
| `fieldComponents`                | Your component for each field kind.                                                              |
| `components`                     | Your `Group`, `RichText`, `Consent`, `Submit` and `Status`.                                      |
| `getFieldState`, `getFieldError` | For a form library to hold values and errors.                                                    |
| `errorText`                      | The words for `required`, `invalid` and `blocked`, and `unticked` for a box that must be ticked. |
| `inside`                         | Drawn above the button: a bot-check widget.                                                      |
| `fallback`                       | Shown instead of HubSpot's embed for a form the site can't draw.                                 |
| `fillHiddenFromAddress`          | Fill hidden fields from the page's address (`?utm_source=`). Default true.                       |
| `onSent`                         | Called once HubSpot has the form.                                                                |

## Security

- The route answers only `studioOrigins` and members of the project, and uses an editor's token for one question to Sanity, never keeping or logging it.
- The Studio can only read the HubSpot key's state, never the key. A pasted key is sealed with a secret only the site holds, and bound to the project and dataset.
- Form copies hold what the page draws and nothing else from HubSpot.
- `submitForm` should be given the form as your server read it from Sanity, never one posted by the browser.
- HubSpot's rich text (descriptions, consent, thank-you) is drawn as HubSpot's embed draws it. Pass your own `RichText` to clean it.

## Coming from `@sanity/form-toolkit`

The form toolkit's `hubSpotForm` field saves a form's id as text, and the site embeds HubSpot's form from it. To move over:

1. Add this plugin and its route, and change the field's type to `hubspot.form`.
2. Open each document and pick the form again. Or have a script set each field to `{_type: 'hubspot.form', formId, name, definition: {_type: 'reference', _ref: 'hubspot-form-<formId>', _weak: true}}`, then open the HubSpot tab: it copies every form a document points at.
3. Replace the embed with `<HubSpotForm form={doc.form?.definition} />`.

A migration script follows in 1.1.

## Not yet verified

- That a Service Key works for every call the route makes, and for the authenticated submit.
- That `setContentType` takes effect when it changes between page changes in a single-page app.
- Whether chat may run before tracking consent.
- That HubSpot's current embed draws a frame added after a page change in a single-page app.

## Developing

```bash
pnpm install
pnpm check
pnpm build
```

`pnpm check` typechecks, lints and runs the tests. A test fails if `/react` or `/server`, types included, reaches Sanity.

### The test Studio and site

`dev/` holds a Studio and a small Next.js site that use the built package, against the plugin's own test project (`3hko8drb`, dataset `production`):

- `dev/studio` on http://localhost:3333: a page and a post type with a form field, a newsletter field that draws its own email field, the page fields, and rich text with form and chat blocks.
- `dev/site` on http://localhost:3000: the route at `/api/hubspot`, and pages that draw their forms. The main form sends through a server action; the others send from the browser.

```bash
pnpm build
pnpm watch                  # rebuilds dist as you edit
pnpm --dir dev/site dev
pnpm --dir dev/studio dev
```

Use `pnpm watch` while the apps run: `pnpm build` empties `dist` first, and a running app fails until it is back.

With neither `HUBSPOT_TOKEN` nor `HUBSPOT_SECRET_KEY` in `dev/site/.env.local`, the route stands in with two sample forms, and sends to them go nowhere. Set either to try a real account. `SANITY_PROJECT_ID` and `SANITY_DATASET` (the site) and `SANITY_STUDIO_PROJECT_ID` and `SANITY_STUDIO_DATASET` (the Studio) point both at another project.

## License

MIT © Confederation Studio
