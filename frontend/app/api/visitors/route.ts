import { env } from 'cloudflare:workers';

export const dynamic = 'force-dynamic';

async function handle(request: Request) {
  const bindings = env as { BACKEND_URL?: string; BACKEND_PROXY_SECRET?: string };
  const url = new URL(request.url);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const backend = bindings.BACKEND_URL || (local ? 'http://127.0.0.1:8000' : '');
  const secret = bindings.BACKEND_PROXY_SECRET || (local ? 'local-only-proxy-secret-00000000000000' : '');
  const unavailable = () => Response.json({ error: 'The visitor yard is temporarily unavailable. Please try again.' }, { status: 503 });
  if (!backend || secret.length < 32) { console.error('Visitor proxy configuration unavailable for host:', url.hostname); return unavailable(); }
  if (request.method !== 'GET' && ((request.headers.get('origin') && request.headers.get('origin') !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site'))
    return Response.json({ error: 'Please leave your slate from the city website.' }, { status: 403 });
  try {
    let body: Uint8Array<ArrayBuffer> | undefined;
    if (request.method !== 'GET' && request.body) {
      const reader = request.body.getReader();
      const chunks: Uint8Array[] = []; let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 1024) { await reader.cancel(); return Response.json({ error: 'The request is too large.' }, { status: 413 }); }
        chunks.push(value);
      }
      body = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
    }
    const headers = new Headers();
    for (const name of ['cookie', 'content-type', 'authorization', 'origin', 'sec-fetch-site']) {
      const value = request.headers.get(name); if (value) headers.set(name, value);
    }
    headers.set('x-city-proxy-token', secret);
    headers.set('x-city-client-ip', local ? 'local-preview' : request.headers.get('cf-connecting-ip') || 'unknown');
    const target = new URL('/api/visitors', backend); target.search = url.search;
    const response = await fetch(target, { method: request.method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(10_000) });
    if (response.status >= 300 && response.status < 400) return unavailable();
    const outgoing = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' });
    for (const name of ['set-cookie', 'retry-after']) {
      const value = response.headers.get(name); if (value) outgoing.set(name, value);
    }
    return new Response(response.body, { status: response.status, headers: outgoing });
  } catch (error) { console.error('Visitor proxy request failed:', error instanceof Error ? error.message : 'unknown error'); return unavailable(); }
}

export { handle as GET, handle as POST, handle as PATCH };
