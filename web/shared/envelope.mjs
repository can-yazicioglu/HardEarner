export const FORMAT = 'hardearner-private-v1';
export const ITERATIONS = 600000;
export const MAX_CIPHERTEXT = 24 * 1024 * 1024;
const b64 = (v, length) => typeof v === 'string' && v.length === length && /^[A-Za-z0-9+/]+={0,2}$/.test(v);
export function validateEnvelope(value) {
  if (!value || value.format !== FORMAT || value.iterations !== ITERATIONS ||
      !b64(value.salt, 44) || !b64(value.iv, 16) ||
      typeof value.ciphertext !== 'string' || value.ciphertext.length < 24 ||
      value.ciphertext.length > MAX_CIPHERTEXT || value.ciphertext.length % 4 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(value.ciphertext)) throw Error('Invalid encrypted vault.');
  // Explicit fields: clients cannot smuggle unencrypted records into cloud storage.
  if (Object.keys(value).sort().join(',') !== 'ciphertext,format,iterations,iv,salt') throw Error('Unexpected vault fields.');
  return value;
}
export function validateRevision(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw Error('Invalid vault revision.');
  return value;
}
