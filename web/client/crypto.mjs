import {FORMAT, ITERATIONS, validateEnvelope} from '../shared/envelope.mjs';
const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', {fatal: true});
export function toBase64(bytes) {
  let value = '';
  for (let i = 0; i < bytes.length; i += 32768) value += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(value);
}
export function fromBase64(value) { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }
export function newSalt() { return toBase64(crypto.getRandomValues(new Uint8Array(32))); }
export async function deriveKey(password, salt) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 256) throw Error('Use a vault password of 12–256 characters.');
  const raw = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(salt), iterations: ITERATIONS}, raw,
    {name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
}
const context = identity => {
  if (typeof identity !== 'string' || !/^[a-f0-9]{64}$/.test(identity)) throw Error('Verified identity required.');
  return encoder.encode(FORMAT + ':' + identity);
};
export async function seal(data, key, salt, identity) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({name: 'AES-GCM', iv, additionalData: context(identity)}, key, encoder.encode(JSON.stringify(data)));
  return validateEnvelope({format: FORMAT, iterations: ITERATIONS, salt, iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(encrypted))});
}
export async function open(envelope, key, identity) {
  validateEnvelope(envelope);
  try {
    const plain = await crypto.subtle.decrypt({name: 'AES-GCM', iv: fromBase64(envelope.iv), additionalData: context(identity)}, key, fromBase64(envelope.ciphertext));
    return JSON.parse(decoder.decode(plain));
  } catch { throw Error('The vault password is incorrect or the encrypted vault could not be verified. Nothing was reset.'); }
}
