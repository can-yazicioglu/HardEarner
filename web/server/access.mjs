import {createRemoteJWKSet, jwtVerify} from 'jose';
import {HttpError} from './http.mjs';
// Public signing keys only. No user tokens, credentials or financial data are cached.
const keysets = new Map();
export async function authenticate(request, env) {
  if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_ISSUER || '') ||
      !/^[a-f0-9]{64}$/.test(env.ACCESS_AUD || '')) throw new HttpError(503, 'Private access has not been configured.');
  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token || token.length > 16384) throw new HttpError(401, 'Sign in to your private HardEarner account.');
  let payload;
  try {
    if (!keysets.has(env.ACCESS_ISSUER)) keysets.set(env.ACCESS_ISSUER, createRemoteJWKSet(new URL(env.ACCESS_ISSUER + '/cdn-cgi/access/certs'), {timeoutDuration: 5000}));
    ({payload} = await jwtVerify(token, keysets.get(env.ACCESS_ISSUER), {issuer: env.ACCESS_ISSUER, audience: env.ACCESS_AUD, algorithms: ['RS256'], requiredClaims: ['exp', 'iat', 'sub', 'email']}));
  } catch { throw new HttpError(401, 'Your private session has expired. Sign in again.'); }
  const email = typeof payload.email === 'string' ? payload.email.toLowerCase().trim() : '';
  const allowed = (env.ALLOWED_EMAILS || '').split(',').map(x => x.toLowerCase().trim()).filter(Boolean);
  if (!email || !allowed.includes(email)) throw new HttpError(403, 'This account has not been invited.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('hardearner-user-v1:' + email));
  return {email, id: Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('')};
}
