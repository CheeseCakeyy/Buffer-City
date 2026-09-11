import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, mkdtempSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { visitorsAPI } from '../visitors.ts';

const secret = 'test-only-secret-0000000000000000000000';
const admin = 'test-only-admin-00000000000000000000000';
function adapter(sqlite) {
  return {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      return {
        values: [],
        bind(...values) { this.values = values; return this; },
        async first() { return statement.get(...this.values) || null; },
        async all() { return { results: statement.all(...this.values) }; },
        async run() { const result = statement.run(...this.values); return { meta: { changes: Number(result.changes) } }; },
      };
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try { const results = []; for (const s of statements) results.push(await s.run()); sqlite.exec('COMMIT'); return results; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
}
function fixture(filename = ':memory:') {
  const sqlite = new DatabaseSync(filename);
  for (const file of readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort()) sqlite.exec(readFileSync(join('drizzle', file), 'utf8'));
  return { sqlite, env: { DB: adapter(sqlite), VISITOR_SECRET: secret, VISITOR_ADMIN_TOKEN: admin } };
}
function req(method = 'GET', value, cookie = '', ip = '203.0.113.10', suffix = '', headers = {}) {
  return new Request(`https://city.example/api/visitors${suffix}`, { method,
    headers: { 'Content-Type': 'application/json', cookie, 'cf-connecting-ip': ip, ...headers },
    ...(value === undefined ? {} : { body: JSON.stringify(value) }),
  });
}
async function visitor(env, ip) {
  const res = await visitorsAPI(req('GET', undefined, '', ip), env);
  return res.headers.get('set-cookie').split(';')[0];
}

test('slates survive a database reopen and are shared, with stable placement and idempotent retries', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ascii-visitors-test-'));
  const file = join(dir, 'visitors.sqlite');
  const { sqlite, env } = fixture(file);
  try {
    const cookie = await visitor(env);
    const create = await visitorsAPI(req('POST', { name: '  Adwait  ' }, cookie), env);
    assert.equal(create.status, 201);
    const first = await create.json();
    assert.equal(first.slate.name, 'Adwait'); assert.equal(first.slate.slot, 0);
    const retry = await (await visitorsAPI(req('POST', { name: 'Adwait' }, cookie), env)).json();
    assert.equal(retry.slate.id, first.slate.id); assert.equal(retry.existing, true);
    sqlite.close();
    const reopened = new DatabaseSync(file);
    try {
      const sharedEnv = { ...env, DB: adapter(reopened) };
      const listing = await (await visitorsAPI(req(), sharedEnv)).json();
      assert.equal(listing.total, 1); assert.equal(listing.slates[0].id, first.slate.id);
      assert.equal(listing.own, null); assert.equal(listing.slates[0].visitor_key, undefined);
      const own = await (await visitorsAPI(req('GET', undefined, cookie), sharedEnv)).json();
      assert.equal(own.alreadyVisited, true);
      const linked = await (await visitorsAPI(req('GET', undefined, '', undefined, `?slate=${first.slate.id}`), sharedEnv)).json();
      assert.equal(linked.slate.id, first.slate.id);
    } finally { reopened.close(); }
  } finally { try { sqlite.close(); } catch {} unlinkSync(file); rmdirSync(dir); }
});

test('validation, same-origin writes, request limits, and fail-closed storage configuration', async () => {
  const { sqlite, env } = fixture();
  try {
    const cookie = await visitor(env);
    for (const name of ['', 'x'.repeat(25), '<script>alert(1)</script>', 'https://example.com', 'a\u202Eb', '---'])
      assert.equal((await visitorsAPI(req('POST', { name }, cookie), env)).status, 400);
    assert.equal((await visitorsAPI(req('POST', { name: '李 明' }, cookie, undefined, '', { origin: 'https://evil.example' }), env)).status, 403);
    assert.equal((await visitorsAPI(req('POST', { name: 'x'.repeat(2000) }, cookie), env)).status, 400);
    assert.equal((await visitorsAPI(req('POST', { name: 'José' }), env)).status, 428);
    assert.equal((await visitorsAPI(req(), {})).status, 503);
    assert.equal((await visitorsAPI(req(), { DB: env.DB })).status, 503);
    const unicode = await visitorsAPI(req('POST', { name: '李 明' }, cookie), env);
    assert.equal(unicode.status, 201);
    assert.equal((await visitorsAPI(req('GET', undefined, cookie, undefined, '?page=-1'), env)).status, 400);
    assert.equal((await visitorsAPI(req('DELETE'), env)).status, 405);
  } finally { sqlite.close(); }
});

test('network rate limit works across cookies and does not reveal raw IP addresses', async () => {
  const { sqlite, env } = fixture();
  try {
    for (let i = 0; i < 6; i++) {
      const cookie = await visitor(env);
      const result = await visitorsAPI(req('POST', { name: `Visitor ${i}` }, cookie), env);
      assert.equal(result.status, i < 5 ? 201 : 429);
      if (i === 5) assert.ok(Number(result.headers.get('retry-after')) > 0);
    }
    const rows = sqlite.prepare('SELECT * FROM submission_limits').all();
    assert.equal(rows.length, 1); assert.equal(rows[0].attempts, 6);
    assert.ok(!JSON.stringify(rows).includes('203.0.113.10'));
  } finally { sqlite.close(); }
});

test('moderation requires a secret; hidden slates disappear without reassigning slots', async () => {
  const { sqlite, env } = fixture();
  try {
    const cookie = await visitor(env);
    const { slate } = await (await visitorsAPI(req('POST', { name: 'Visitor' }, cookie), env)).json();
    assert.equal((await visitorsAPI(req('PATCH', { id: slate.id, hidden: true }), env)).status, 401);
    assert.equal((await visitorsAPI(req('PATCH', { id: slate.id, hidden: true }, '', undefined, '', { authorization: `Bearer ${admin}` }), env)).status, 200);
    assert.equal((await (await visitorsAPI(req(), env)).json()).total, 0);
    assert.equal((await visitorsAPI(req('GET', undefined, '', undefined, `?slate=${slate.id}`), env)).status, 404);
    assert.equal((await visitorsAPI(req('POST', { name: 'Again' }, cookie), env)).status, 409);
    const secondCookie = await visitor(env);
    const second = await (await visitorsAPI(req('POST', { name: 'Second' }, secondCookie), env)).json();
    assert.equal(second.slate.slot, 1);
    assert.equal((await visitorsAPI(req('PATCH', { id: slate.id, hidden: false }, '', undefined, '', { authorization: `Bearer ${admin}` }), env)).status, 200);
    assert.equal((await (await visitorsAPI(req(), env)).json()).total, 2);
  } finally { sqlite.close(); }
});

test('garden pages are bounded and deep links identify the correct page', async () => {
  const { sqlite, env } = fixture();
  try {
    let id;
    for (let i = 0; i < 50; i++) {
      id = crypto.randomUUID();
      sqlite.prepare('INSERT INTO visitors (id, name, created_at, visitor_key) VALUES (?, ?, ?, ?)').run(id, `Visitor ${i}`, Date.now(), `seed-${i}`);
    }
    const first = await (await visitorsAPI(req(), env)).json();
    assert.equal(first.slates.length, 48); assert.equal(first.lastPage, 1);
    const next = await (await visitorsAPI(req('GET', undefined, '', undefined, '?page=1'), env)).json();
    assert.equal(next.slates.length, 2); assert.equal(next.slates[0].slot, 0);
    const link = await (await visitorsAPI(req('GET', undefined, '', undefined, `?slate=${id}`), env)).json();
    assert.equal(link.slate.page, 1); assert.equal(link.slate.slot, 1);
  } finally { sqlite.close(); }
});
