/**
 * Seals the HubSpot key an administrator pastes in the Studio, so the settings document holds
 * nothing any project member could use. AES-256-GCM through WebCrypto, with a key derived from
 * the site's `HUBSPOT_SECRET_KEY`. The project and dataset are bound in, so a sealed key copied
 * to another dataset won't open.
 */

const VERSION = 'v1'
const encoder = new TextEncoder()

export const MIN_SECRET_LENGTH = 32

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

async function aesKey(secret: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(secret), 'HKDF', false, [
    'deriveKey',
  ])
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32),
      info: encoder.encode('sanity-plugin-hubspot/sealed-key'),
    },
    material,
    {name: 'AES-GCM', length: 256},
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function seal(secret: string, plain: string, boundTo: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const sealed = await crypto.subtle.encrypt(
    {name: 'AES-GCM', iv, additionalData: encoder.encode(boundTo)},
    await aesKey(secret),
    encoder.encode(plain),
  )
  return `${VERSION}.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(sealed))}`
}

/** The sealed text opened, or null when it was sealed with another secret or for another place. */
export async function unseal(
  secret: string,
  sealed: string,
  boundTo: string,
): Promise<string | null> {
  const [version, iv, data] = sealed.split('.')
  if (version !== VERSION || !iv || !data) return null
  try {
    const plain = await crypto.subtle.decrypt(
      {name: 'AES-GCM', iv: fromBase64Url(iv), additionalData: encoder.encode(boundTo)},
      await aesKey(secret),
      fromBase64Url(data),
    )
    return new TextDecoder().decode(plain)
  } catch {
    return null
  }
}
