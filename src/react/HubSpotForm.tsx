import {
  useCallback,
  useId,
  useMemo,
  useState,
  type ComponentType,
  type ChangeEvent,
  type FormHTMLAttributes,
  type ReactNode,
  type SubmitEvent,
} from 'react'

import {allFields} from '../core/drawable'
import {layoutForm, type HubSpotAnswers, type HubSpotFieldView} from '../core/layout'
import type {
  HubSpotFieldError,
  HubSpotFieldType,
  HubSpotFormDefinition,
  HubSpotSubmitResult,
} from '../core/model'
import {FORM_INPUT, HONEYPOT_INPUT, inputName, PAGE_NAME_INPUT, PAGE_URI_INPUT} from '../core/names'
import {isHttpUrl} from '../core/text'
import {defaultFieldComponents, type HubSpotFieldProps, type HubSpotFieldState} from './fields'
import {HubSpotEmbed} from './HubSpotEmbed'
import {
  DefaultConsent,
  DefaultGroup,
  DefaultRichText,
  DefaultStatus,
  DefaultSubmit,
  Honeypot,
  type HubSpotConsentProps,
  type HubSpotGroupProps,
  type HubSpotRichTextProps,
  type HubSpotStatusProps,
  type HubSpotSubmitProps,
} from './parts'
import {fillFromAddress, sendHubSpotForm} from './send'

export interface HubSpotFormComponents {
  Group: ComponentType<HubSpotGroupProps>
  RichText: ComponentType<HubSpotRichTextProps>
  Consent: ComponentType<HubSpotConsentProps>
  Submit: ComponentType<HubSpotSubmitProps>
  Status: ComponentType<HubSpotStatusProps>
}

export const DEFAULT_ERROR_TEXT: Record<HubSpotFieldError, string> = {
  required: 'Please fill this in.',
  invalid: 'Please check this.',
  blocked: 'Please use another email address.',
}

export interface HubSpotFormProps extends Omit<
  FormHTMLAttributes<HTMLFormElement>,
  'action' | 'onSubmit' | 'children'
> {
  /** The form's copy, from the page's query: `definition->` on a `hubspot.form` field. */
  form: HubSpotFormDefinition | null | undefined
  /**
   * Sends from the site's server: a server action that calls `submitForm`. Without one, the
   * browser sends to HubSpot's public endpoint.
   */
  action?: (data: FormData) => Promise<HubSpotSubmitResult>
  /** The site's own component for each kind of field. Kinds left out are drawn in plain HTML. */
  fieldComponents?: Partial<Record<HubSpotFieldType, ComponentType<HubSpotFieldProps>>>
  /** The site's own rows, rich text, consent, button and status line. */
  components?: Partial<HubSpotFormComponents>
  /** A field's state by input name, for react-hook-form, TanStack Form or Formik to hold it. */
  getFieldState?: (name: string) => HubSpotFieldState | undefined
  /** A field's error by input name, from the site's form library. Wins over HubSpot's. */
  getFieldError?: (name: string) => string | undefined
  /** The words for HubSpot's errors. */
  errorText?: Partial<Record<HubSpotFieldError, string>>
  /** Drawn above the button: a bot check, such as Cloudflare Turnstile's widget. */
  inside?: ReactNode
  /** Shown instead of HubSpot's embed for a form the site can't draw. */
  fallback?: ReactNode
  /** Fill hidden fields from the page's address (`?utm_source=`). Default: true. */
  fillHiddenFromAddress?: boolean
  onSent?: (result: Extract<HubSpotSubmitResult, {status: 'sent'}>) => void
}

const strings = (values: FormDataEntryValue[]): string[] =>
  values.filter((value): value is string => typeof value === 'string')

/**
 * Draws a HubSpot form in the site's own design, from the copy the page's query read, and sends
 * it to HubSpot. Follow-up fields show as their conditions hold, hidden fields carry their
 * values, and a honeypot drops bots. A form the site can't draw is shown with HubSpot's embed.
 */
export function HubSpotForm(props: HubSpotFormProps) {
  const {
    form,
    action,
    fieldComponents,
    components,
    getFieldState,
    getFieldError,
    errorText,
    inside,
    fallback,
    fillHiddenFromAddress = true,
    onSent,
    ...formProps
  } = props
  const baseId = useId()
  const [typed, setTyped] = useState<HubSpotAnswers>({})
  const [errors, setErrors] = useState<Record<string, HubSpotFieldError>>({})
  const [result, setResult] = useState<HubSpotSubmitResult | null>(null)
  const [pending, setPending] = useState(false)

  const Group = components?.Group ?? DefaultGroup
  const RichText = components?.RichText ?? DefaultRichText
  const Consent = components?.Consent ?? DefaultConsent
  const Submit = components?.Submit ?? DefaultSubmit
  const Status = components?.Status ?? DefaultStatus

  const fields = useMemo(() => (form ? allFields(form.groups) : []), [form])
  const asks = useMemo(() => fields.some((field) => field.followUps.length > 0), [fields])

  // What the visitor has answered: the site's state where it holds it, else what the inputs say.
  const answers = useMemo(() => {
    if (!getFieldState) return typed
    const merged: Record<string, readonly string[]> = {...typed}
    for (const field of fields) {
      const value = getFieldState(inputName(field))?.value
      if (value !== undefined)
        merged[inputName(field)] = typeof value === 'string' ? [value] : value
    }
    return merged
  }, [fields, getFieldState, typed])

  const parts = useMemo(() => (form ? layoutForm(form, answers) : []), [form, answers])
  const shown = useMemo(
    () => parts.flatMap((part) => (part.kind === 'row' ? part.fields : [])),
    [parts],
  )

  const onChange = useCallback(
    (event: ChangeEvent<HTMLFormElement>) => {
      const changed = event.target instanceof HTMLElement ? event.target.getAttribute('name') : null
      if (changed)
        setErrors((current) => {
          if (!(changed in current)) return current
          const {[changed]: _gone, ...rest} = current
          return rest
        })
      // Follow-ups need the answers of the fields that show; a plain form has nothing to track.
      if (!asks) return
      const data = new FormData(event.currentTarget)
      const next: Record<string, string[]> = {}
      for (const field of shown) next[field.name] = strings(data.getAll(field.name))
      setTyped(next)
    },
    [asks, shown],
  )

  const onSubmit = useCallback(
    async (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!form || pending) return
      const element = event.currentTarget
      const data = new FormData(element)
      // A field the site's library holds may draw no input of its own.
      if (getFieldState)
        for (const field of shown) {
          const value = getFieldState(field.name)?.value
          if (value === undefined) continue
          data.delete(field.name)
          for (const one of typeof value === 'string' ? [value] : value)
            data.append(field.name, one)
        }
      data.set(PAGE_URI_INPUT, window.location.href)
      data.set(PAGE_NAME_INPUT, document.title)
      if (fillHiddenFromAddress)
        fillFromAddress(form, data, new URLSearchParams(window.location.search))

      setPending(true)
      const outcome: HubSpotSubmitResult = await (action
        ? action(data).catch((): HubSpotSubmitResult => ({status: 'failed'}))
        : sendHubSpotForm(form, data))
      setPending(false)
      setResult(outcome)
      setErrors(outcome.status === 'invalid' ? outcome.errors : {})
      if (outcome.status === 'invalid') {
        const [firstName] = Object.keys(outcome.errors)
        if (firstName)
          element.querySelector<HTMLElement>(`[name="${CSS.escape(firstName)}"]`)?.focus()
      }
      if (outcome.status === 'sent') {
        onSent?.(outcome)
        if (outcome.redirect && isHttpUrl(outcome.redirect))
          window.location.assign(outcome.redirect)
      }
    },
    [action, fillHiddenFromAddress, form, getFieldState, onSent, pending, shown],
  )

  if (!form) return null
  if (!form.drawable) return <>{fallback ?? <HubSpotEmbed form={form} />}</>
  if (result?.status === 'sent' && !result.redirect)
    return <Status result={result} RichText={RichText} />

  const errorFor = (name: string): string | undefined => {
    const kind = errors[name]
    return getFieldError?.(name) ?? (kind && (errorText?.[kind] ?? DEFAULT_ERROR_TEXT[kind]))
  }
  const renderField = (field: HubSpotFieldView) => {
    const Field = fieldComponents?.[field.type] ?? defaultFieldComponents[field.type]
    if (!Field) return null
    return (
      <Field
        key={field.key}
        field={field}
        fieldState={getFieldState?.(field.name) ?? {}}
        error={errorFor(field.name)}
        id={`${baseId}-${field.key}`}
      />
    )
  }
  const consentErrors = Object.fromEntries(
    Object.keys(errors).map((name) => [name, errorFor(name)]),
  )

  return (
    <form
      {...formProps}
      noValidate
      onSubmit={onSubmit}
      onChange={onChange}
      data-hubspot-form={form.formId}
    >
      <input type="hidden" name={FORM_INPUT} value={form.formId} />
      {parts.map((part) => {
        if (part.kind === 'text') return <RichText key={part.key} html={part.html} kind="text" />
        if (part.kind === 'hidden')
          return <input key={part.key} type="hidden" name={part.name} defaultValue={part.value} />
        return (
          <Group key={part.key} columns={part.fields.length}>
            {part.fields.map(renderField)}
          </Group>
        )
      })}
      <Consent
        consent={form.consent}
        errors={consentErrors}
        idPrefix={baseId}
        RichText={RichText}
      />
      <Honeypot name={HONEYPOT_INPUT} />
      {inside}
      {result && result.status !== 'sent' && <Status result={result} RichText={RichText} />}
      <Submit text={form.submitText} pending={pending} />
    </form>
  )
}
