export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function json(value, status = 200) {
  return Response.json(value, {status, headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer'}});
}
export async function boundedJson(request, limit) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new HttpError(415, 'JSON required.');
  const declared = Number(request.headers.get('content-length'));
  if (declared > limit) throw new HttpError(413, 'Request too large.');
  if (!request.body) throw new HttpError(400, 'Request body required.');
  const reader = request.body.getReader(), chunks = []; let size = 0;
  while (true) {
    const {value, done} = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw new HttpError(413, 'Request too large.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes)); }
  catch { throw new HttpError(400, 'Invalid JSON.'); }
}
export function requireSameOrigin(request) {
  const origin = request.headers.get('origin');
  if (origin !== new URL(request.url).origin || ['cross-site', 'none'].includes(request.headers.get('sec-fetch-site'))) {
    throw new HttpError(403, 'Open this action from HardEarner.');
  }
}
