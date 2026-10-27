import type {ChangeEvent, ComponentType, CSSProperties} from 'react'

import type {HubSpotFieldView} from '../core/layout'
import type {HubSpotFieldType} from '../core/model'

/**
 * A field's state, when the site's form library holds it (`getFieldState`). Leave it out and the
 * field is the browser's, as a plain form's is.
 */
export interface HubSpotFieldState {
  value?: string | readonly string[]
  onChange?: (value: string | string[]) => void
  onBlur?: () => void
  ref?: (element: HTMLElement | null) => void
}

export interface HubSpotFieldProps {
  field: HubSpotFieldView
  fieldState: HubSpotFieldState
  error?: string
  /** The id for the field's input, which its label points at. */
  id: string
}

/** Hidden from sight, not from screen readers: the label of a field HubSpot left unlabelled. */
export const visuallyHidden: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  border: 0,
}

/** What browsers fill in, by HubSpot's default contact properties. */
const AUTOCOMPLETE: Record<string, string> = {
  email: 'email',
  firstname: 'given-name',
  lastname: 'family-name',
  phone: 'tel',
  mobilephone: 'tel',
  company: 'organization',
  jobtitle: 'organization-title',
  address: 'street-address',
  city: 'address-level2',
  state: 'address-level1',
  zip: 'postal-code',
  country: 'country-name',
  website: 'url',
}

const INPUT_TYPES: Partial<Record<HubSpotFieldType, string>> = {
  text: 'text',
  email: 'email',
  tel: 'tel',
  number: 'number',
  date: 'date',
}

const first = (value: string | readonly string[] | undefined): string =>
  typeof value === 'string' ? value : (value?.[0] ?? '')

const many = (value: string | readonly string[] | undefined): readonly string[] =>
  typeof value === 'string' ? (value === '' ? [] : [value]) : (value ?? [])

function describedBy(field: HubSpotFieldView, id: string, error: string | undefined) {
  const ids = [field.description && `${id}-description`, error && `${id}-error`].filter(Boolean)
  return ids.length > 0 ? ids.join(' ') : undefined
}

function Label({field, id}: {field: HubSpotFieldView; id: string}) {
  return (
    <label htmlFor={id} style={field.hasLabel ? undefined : visuallyHidden}>
      {field.label}
      {field.required && <span aria-hidden="true"> *</span>}
    </label>
  )
}

function Legend({field}: {field: HubSpotFieldView}) {
  return (
    <legend style={field.hasLabel ? undefined : visuallyHidden}>
      {field.label}
      {field.required && <span aria-hidden="true"> *</span>}
    </legend>
  )
}

function After({field, id, error}: {field: HubSpotFieldView; id: string; error?: string}) {
  return (
    <>
      {field.description && (
        <div
          id={`${id}-description`}
          data-hubspot-description=""
          dangerouslySetInnerHTML={{__html: field.description}}
        />
      )}
      {error && (
        <p id={`${id}-error`} data-hubspot-error="">
          {error}
        </p>
      )}
    </>
  )
}

/** The value props for an input, controlled when the site holds the state. */
function valueProps(field: HubSpotFieldView, state: HubSpotFieldState) {
  const onChange = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => state.onChange?.(event.currentTarget.value)
  return state.value === undefined
    ? {defaultValue: field.defaultValues[0], ...(state.onChange && {onChange})}
    : {value: first(state.value), onChange}
}

function common(
  field: HubSpotFieldView,
  id: string,
  error: string | undefined,
  state: HubSpotFieldState,
) {
  return {
    id,
    'name': field.name,
    'aria-required': field.required || undefined,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy(field, id, error),
    'onBlur': state.onBlur,
    'ref': state.ref,
  }
}

export function InputField({field, fieldState, error, id}: HubSpotFieldProps) {
  return (
    <div data-hubspot-field={field.type}>
      <Label field={field} id={id} />
      <input
        {...common(field, id, error, fieldState)}
        {...valueProps(field, fieldState)}
        type={INPUT_TYPES[field.type] ?? 'text'}
        placeholder={field.placeholder}
        autoComplete={AUTOCOMPLETE[field.property]}
        {...(field.type === 'number' && {inputMode: 'decimal' as const, step: 'any'})}
      />
      <After field={field} id={id} error={error} />
    </div>
  )
}

export function TextareaField({field, fieldState, error, id}: HubSpotFieldProps) {
  return (
    <div data-hubspot-field={field.type}>
      <Label field={field} id={id} />
      <textarea
        {...common(field, id, error, fieldState)}
        {...valueProps(field, fieldState)}
        placeholder={field.placeholder}
        rows={4}
      />
      <After field={field} id={id} error={error} />
    </div>
  )
}

export function SelectField({field, fieldState, error, id}: HubSpotFieldProps) {
  return (
    <div data-hubspot-field={field.type}>
      <Label field={field} id={id} />
      <select {...common(field, id, error, fieldState)} {...valueProps(field, fieldState)}>
        <option value="">{field.placeholder ?? 'Please choose'}</option>
        {field.options.map((option) => (
          <option key={option._key} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <After field={field} id={id} error={error} />
    </div>
  )
}

/** Radios and checkboxes: a fieldset of options under one name. */
function OptionsField({
  field,
  fieldState,
  error,
  id,
  multiple,
}: HubSpotFieldProps & {multiple: boolean}) {
  const chosen = fieldState.value === undefined ? undefined : many(fieldState.value)
  const toggle = (value: string, on: boolean) => {
    if (!fieldState.onChange) return
    if (!multiple) return fieldState.onChange(value)
    const current = chosen ?? []
    fieldState.onChange(on ? [...current, value] : current.filter((one) => one !== value))
  }
  return (
    <fieldset
      data-hubspot-field={field.type}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy(field, id, error)}
    >
      <Legend field={field} />
      {field.options.map((option, index) => (
        <label key={option._key} htmlFor={`${id}-${index}`}>
          <input
            id={`${id}-${index}`}
            type={multiple ? 'checkbox' : 'radio'}
            name={field.name}
            value={option.value}
            onBlur={fieldState.onBlur}
            {...(chosen === undefined
              ? {defaultChecked: field.defaultValues.includes(option.value)}
              : {checked: chosen.includes(option.value)})}
            {...((chosen !== undefined || fieldState.onChange) && {
              onChange: (event: ChangeEvent<HTMLInputElement>) =>
                toggle(option.value, event.currentTarget.checked),
            })}
          />{' '}
          {option.label}
        </label>
      ))}
      <After field={field} id={id} error={error} />
    </fieldset>
  )
}

export const RadioField = (props: HubSpotFieldProps) => <OptionsField {...props} multiple={false} />
export const CheckboxesField = (props: HubSpotFieldProps) => <OptionsField {...props} multiple />

/** A single box, which sends `true` when ticked and nothing when not. */
export function CheckboxField({field, fieldState, error, id}: HubSpotFieldProps) {
  const ticked = fieldState.value === undefined ? undefined : first(fieldState.value) === 'true'
  return (
    <div data-hubspot-field={field.type}>
      <input
        {...common(field, id, error, fieldState)}
        type="checkbox"
        value="true"
        {...(ticked === undefined
          ? {defaultChecked: field.defaultValues[0] === 'true'}
          : {checked: ticked})}
        {...((ticked !== undefined || fieldState.onChange) && {
          onChange: (event: ChangeEvent<HTMLInputElement>) =>
            fieldState.onChange?.(event.currentTarget.checked ? 'true' : 'false'),
        })}
      />{' '}
      <Label field={field} id={id} />
      <After field={field} id={id} error={error} />
    </div>
  )
}

/**
 * The plain HTML fields `<HubSpotForm>` draws when the site gives none. `file`, `payment` and
 * `unknown` have none: a form with any of them is shown with HubSpot's embed.
 */
export const defaultFieldComponents: Partial<
  Record<HubSpotFieldType, ComponentType<HubSpotFieldProps>>
> = {
  text: InputField,
  email: InputField,
  tel: InputField,
  number: InputField,
  date: InputField,
  textarea: TextareaField,
  select: SelectField,
  radio: RadioField,
  checkboxes: CheckboxesField,
  checkbox: CheckboxField,
}
