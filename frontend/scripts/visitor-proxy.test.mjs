import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../app/api/visitors/route.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { GET, POST, PATCH } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

test('Vercel proxy preserves the backend contract without exposing credentials', async () => {
  const keys = ['NODE_ENV', 'VERCEL', 'BACKEND_URL', 'BACKEND_PROXY_SECRET'];
  const originalEnv = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  const originalFetch = globalThis.fetch;
  try {
    Object.assign(process.env, { NODE_ENV: 'production', VERCEL: '1', BACKEND_URL: 'https://api.example.test', BACKEND_PROXY_SECRET: 'test-proxy-secret-with-at-least-32-characters' });
    let calls = 0, received;
    globalThis.fetch = async (url, init) => {
      calls++; received = { url: String(url), init };
      return new Response(JSON.stringify({ slates: [] }), { status: 200, headers: { 'set-cookie': 'city_visitor=test; HttpOnly; Secure; SameSite=Lax; Path=/', 'retry-after': '60' } });
    };
    const res = await GET(new Request('https://city.example.test/api/visitors?page=2', { headers: { cookie: 'city_visitor=test', 'x-forwarded-for': '203.0.113.42', 'cf-connecting-ip': 'attacker', 'x-city-client-ip': 'attacker' } }));
    assert.equal(received.url, 'https://api.example.test/api/visitors?page=2');
    assert.equal(received.init.headers.get('x-city-client-ip'), '203.0.113.42');
    assert.equal(received.init.headers.get('x-city-proxy-token'), process.env.BACKEND_PROXY_SECRET);
    assert.equal(received.init.headers.get('cookie'), 'city_visitor=test');
    assert.match(res.headers.get('set-cookie'), /HttpOnly; Secure/);
    assert.equal(res.headers.get('retry-after'), '60');
    assert.equal(res.headers.get('cache-control'), 'private, no-store');
    assert.equal(res.headers.get('x-city-proxy-token'), null);
    assert.deepEqual(await res.json(), { slates: [] });

    const request = (body, origin = 'https://city.example.test', method = 'POST') => new Request('https://city.example.test/api/visitors', { method, headers: { 'content-type': 'application/json', origin, authorization: 'Bearer moderation-test' }, body });
    assert.equal((await POST(request('{"name":"Visitor"}'))).status, 200);
    assert.equal(new TextDecoder().decode(received.init.body), '{"name":"Visitor"}');
    assert.equal((await PATCH(request('{"hidden":true}', undefined, 'PATCH'))).status, 200);
    assert.equal(received.init.headers.get('authorization'), 'Bearer moderation-test');
    const before = calls;
    assert.equal((await POST(request('{}', 'https://other.example.test'))).status, 403);
    assert.equal((await POST(request('x'.repeat(1025)))).status, 413);
    assert.equal(calls, before);
    process.env.BACKEND_URL = 'http://api.example.test';
    assert.equal((await GET(new Request('https://city.example.test/api/visitors'))).status, 503);
    delete process.env.BACKEND_PROXY_SECRET;
    assert.equal((await GET(new Request('http://localhost:3000/api/visitors'))).status, 503, 'Production must never use development fallback credentials');
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of keys) if (originalEnv[key] === undefined) delete process.env[key]; else process.env[key] = originalEnv[key];
  }
});
