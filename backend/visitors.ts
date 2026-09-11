export interface VisitorEnvironment {
  DB?: D1Database;
  VISITOR_SECRET?: string;
  VISITOR_ADMIN_TOKEN?: string;
}

type Row = { sequence: number; id: string; name: string; created_at: number; hidden: number };
const PAGE_SIZE = 48;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const fields = 'sequence, id, name, created_at, hidden';
const publicSlate = (row: Row) => ({
  id: row.id, name: row.name, createdAt: new Date(row.created_at).toISOString(),
  slot: (row.sequence - 1) % PAGE_SIZE, page: Math.floor((row.sequence - 1) / PAGE_SIZE),
});

function response(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', ...headers } });
}

async function digest(secret: string, value: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const hash = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('');
}

async function body(request: Request): Promise<Record<string, unknown> | null> {
  if (!request.headers.get('content-type')?.startsWith('application/json') || !request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 1024) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const joined = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
    const parsed = JSON.parse(new TextDecoder().decode(joined));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}

// Shared by the frontend's thin HTTP adapter and the independently deployable Worker.
// Every query is parameterized. Schema changes are applied only through migrations.
export async function visitorsAPI(request: Request, env: VisitorEnvironment): Promise<Response> {
  const url = new URL(request.url);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const secret = env.VISITOR_SECRET || (local ? 'local-preview-only-visitor-secret-00000000' : '');
  if (!env.DB || secret.length < 32) return response({ error: 'The visitor yard is temporarily unavailable. Please try again later.' }, 503);
  const db = env.DB;
  const cookie = request.headers.get('cookie')?.match(/(?:^|;\s*)city_visitor=([^;]+)/)?.[1];
  const token = cookie && UUID.test(cookie) ? cookie : crypto.randomUUID();
  const cookieHeader = { 'Set-Cookie': `city_visitor=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${url.protocol === 'https:' ? '; Secure' : ''}` };
  try {
    const visitorKey = await digest(secret, `visitor:${token}`);
    if (request.method === 'GET') {
      const slateId = url.searchParams.get('slate');
      if (slateId) {
        if (!UUID.test(slateId)) return response({ error: 'That slate could not be found.' }, 404);
        const slate = await db.prepare(`SELECT ${fields} FROM visitors WHERE id = ? AND hidden = 0`).bind(slateId).first<Row>();
        return slate ? response({ slate: publicSlate(slate) }, 200, cookieHeader) : response({ error: 'That slate is no longer on display.' }, 404, cookieHeader);
      }
      const rawPage = url.searchParams.get('page') || '0';
      if (!/^\d{1,7}$/.test(rawPage)) return response({ error: 'Invalid garden page.' }, 400);
      const page = Number(rawPage);
      const [rows, totals, own] = await Promise.all([
        db.prepare(`SELECT ${fields} FROM visitors WHERE sequence > ? AND sequence <= ? AND hidden = 0 ORDER BY sequence`)
          .bind(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).all<Row>(),
        db.prepare('SELECT COUNT(CASE WHEN hidden = 0 THEN 1 END) AS total, COALESCE(MAX(sequence), 1) AS last FROM visitors').first<{ total: number; last: number }>(),
        db.prepare(`SELECT ${fields} FROM visitors WHERE visitor_key = ?`).bind(visitorKey).first<Row>(),
      ]);
      return response({ slates: rows.results.map(publicSlate), page, pageSize: PAGE_SIZE,
        lastPage: Math.floor(((totals?.last || 1) - 1) / PAGE_SIZE), total: totals?.total || 0,
        own: own && !own.hidden ? publicSlate(own) : null, alreadyVisited: Boolean(own),
      }, 200, cookieHeader);
    }
    if (!['POST', 'PATCH'].includes(request.method)) return response({ error: 'Method not allowed.' }, 405, { Allow: 'GET, POST, PATCH' });
    if ((request.headers.get('origin') && request.headers.get('origin') !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site')
      return response({ error: 'Please leave your slate from the city website.' }, 403);
    const input = await body(request);
    if (!input) return response({ error: 'Please send a small JSON request.' }, 400);
    if (request.method === 'PATCH') {
      const admin = env.VISITOR_ADMIN_TOKEN;
      const supplied = request.headers.get('authorization')?.replace(/^Bearer /, '') || '';
      if (!admin || admin.length < 32 || await digest(secret, supplied) !== await digest(secret, admin))
        return response({ error: 'Unauthorized.' }, 401);
      if (typeof input.id !== 'string' || !UUID.test(input.id) || typeof input.hidden !== 'boolean')
        return response({ error: 'A slate ID and hidden status are required.' }, 400);
      const result = await db.prepare('UPDATE visitors SET hidden = ? WHERE id = ?').bind(input.hidden ? 1 : 0, input.id).run();
      return result.meta.changes ? response({ ok: true }) : response({ error: 'Slate not found.' }, 404);
    }
    if (!cookie || !UUID.test(cookie)) return response({ error: 'Refresh the visitor yard before placing your slate.' }, 428, cookieHeader);
    const name = typeof input.name === 'string' ? input.name.normalize('NFC').trim().replace(/\s+/g, ' ') : '';
    if (Array.from(name).length < 1 || Array.from(name).length > 24 || !/^[\p{L}\p{M}\p{N} _'’-]+$/u.test(name) || !/[\p{L}\p{N}]/u.test(name))
      return response({ error: 'Use 1–24 letters or numbers, with spaces, hyphens, underscores or apostrophes. No links.' }, 400);
    const own = await db.prepare(`SELECT ${fields} FROM visitors WHERE visitor_key = ?`).bind(visitorKey).first<Row>();
    if (own) return own.hidden ? response({ error: 'Your visit has already been recorded.' }, 409) : response({ slate: publicSlate(own), existing: true });
    const now = Date.now();
    // Only Cloudflare's trusted client-IP header is used; forwarded-for is ignored.
    const ip = request.headers.get('cf-connecting-ip') || (local ? 'local-preview' : 'unknown');
    const window = Math.floor(now / 3_600_000);
    const rateKey = await digest(secret, `network:${ip}:${window}`);
    const id = crypto.randomUUID();
    const batch = await db.batch([
      db.prepare('DELETE FROM submission_limits WHERE expires_at < ?').bind(now),
      db.prepare('INSERT INTO submission_limits (key, attempts, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET attempts = attempts + 1')
        .bind(rateKey, (window + 1) * 3_600_000),
      db.prepare('INSERT INTO visitors (id, name, created_at, visitor_key, hidden) SELECT ?, ?, ?, ?, 0 WHERE (SELECT attempts FROM submission_limits WHERE key = ?) <= 5 ON CONFLICT(visitor_key) DO NOTHING')
        .bind(id, name, now, visitorKey, rateKey),
    ]);
    const saved = await db.prepare(`SELECT ${fields} FROM visitors WHERE visitor_key = ?`).bind(visitorKey).first<Row>();
    if (saved) return response({ slate: publicSlate(saved), existing: batch[2].meta.changes === 0 }, batch[2].meta.changes ? 201 : 200);
    return response({ error: 'This connection has left several slates recently. Please try again in an hour.' }, 429, { 'Retry-After': String(Math.ceil(((window + 1) * 3_600_000 - now) / 1000)) });
  } catch (error) {
    console.error('Visitor yard request failed:', error instanceof Error ? error.message : 'database unavailable');
    return response({ error: 'The visitor yard could not be reached. Your name has not been cleared; please try again.' }, 503);
  }
}
