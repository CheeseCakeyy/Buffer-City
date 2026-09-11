from contextlib import asynccontextmanager
from datetime import datetime, timezone
from hashlib import sha256
from hmac import compare_digest, new as hmac_new
import json
import logging
import re
import sqlite3
import time
import unicodedata
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from .database import connect, migrate
from .settings import Settings

PAGE_SIZE = 48
UUID = re.compile(r'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$', re.I)


def result(data, status=200, headers=None):
    return JSONResponse(data, status_code=status, headers={'Cache-Control': 'private, no-store', **(headers or {})})


def slate(row):
    return {'id': row['id'], 'name': row['name'],
            'createdAt': datetime.fromtimestamp(row['created_at'] / 1000, timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z'),
            'slot': (row['sequence'] - 1) % PAGE_SIZE, 'page': (row['sequence'] - 1) // PAGE_SIZE}


def digest(secret, value):
    return hmac_new(secret.encode(), value.encode(), sha256).hexdigest()


def valid_name(value):
    if not isinstance(value, str):
        return None
    name = ' '.join(unicodedata.normalize('NFC', value).split())
    if not 1 <= len(name) <= 24:
        return None
    categories = [unicodedata.category(char)[0] for char in name]
    if not any(c in 'LN' for c in categories):
        return None
    if any(c not in 'LMN' and char not in " _'’-" for c, char in zip(categories, name)):
        return None
    return name


def handle(settings, method, query, headers, cookies, body, client_ip):
    token = cookies.get('city_visitor', '')
    established = bool(UUID.fullmatch(token))
    if not established:
        token = str(uuid4())
    cookie = {'Set-Cookie': f'city_visitor={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000' + ('; Secure' if settings.production else '')}
    key = digest(settings.secret, f'visitor:{token}')
    with connect(settings.database) as db:
        if method == 'GET':
            ident = query.get('slate')
            if ident:
                row = db.execute('SELECT * FROM visitors WHERE id = ? AND hidden = 0', (ident,)).fetchone() if UUID.fullmatch(ident) else None
                return result({'slate': slate(row)}, headers=cookie) if row else result({'error': 'That slate is no longer on display.'}, 404, cookie)
            raw_page = query.get('page', '0')
            if not re.fullmatch(r'[0-9]{1,7}', raw_page):
                return result({'error': 'Invalid garden page.'}, 400)
            page = int(raw_page)
            rows = db.execute('SELECT * FROM visitors WHERE sequence > ? AND sequence <= ? AND hidden = 0 ORDER BY sequence', (page * PAGE_SIZE, (page + 1) * PAGE_SIZE)).fetchall()
            totals = db.execute('SELECT COUNT(CASE WHEN hidden = 0 THEN 1 END) AS total, COALESCE(MAX(sequence), 1) AS last FROM visitors').fetchone()
            own = db.execute('SELECT * FROM visitors WHERE visitor_key = ?', (key,)).fetchone()
            return result({'slates': [slate(row) for row in rows], 'page': page, 'pageSize': PAGE_SIZE,
                           'lastPage': (totals['last'] - 1) // PAGE_SIZE, 'total': totals['total'],
                           'own': slate(own) if own and not own['hidden'] else None, 'alreadyVisited': own is not None}, headers=cookie)
        if headers.get('origin') and headers['origin'] != settings.public_origin:
            return result({'error': 'Please leave your slate from the city website.'}, 403)
        if headers.get('sec-fetch-site') == 'cross-site':
            return result({'error': 'Cross-site writes are not allowed.'}, 403)
        if method == 'PATCH':
            supplied = headers.get('authorization', '').removeprefix('Bearer ')
            if not settings.admin_token or not compare_digest(digest(settings.secret, supplied), digest(settings.secret, settings.admin_token)):
                return result({'error': 'Unauthorized.'}, 401)
            if not isinstance(body.get('id'), str) or not UUID.fullmatch(body['id']) or type(body.get('hidden')) is not bool:
                return result({'error': 'A slate ID and hidden status are required.'}, 400)
            changed = db.execute('UPDATE visitors SET hidden = ? WHERE id = ?', (int(body['hidden']), body['id'])).rowcount
            db.commit()
            return result({'ok': True}) if changed else result({'error': 'Slate not found.'}, 404)
        if not established:
            return result({'error': 'Refresh the visitor yard before placing your slate.'}, 428, cookie)
        name = valid_name(body.get('name'))
        if name is None:
            return result({'error': 'Use 1–24 letters or numbers, with spaces, hyphens, underscores or apostrophes. No links.'}, 400)
        # One transaction protects cookie deduplication, network limits and slot allocation.
        db.execute('BEGIN IMMEDIATE')
        own = db.execute('SELECT * FROM visitors WHERE visitor_key = ?', (key,)).fetchone()
        if own:
            db.rollback()
            return result({'error': 'Your visit has already been recorded.'}, 409) if own['hidden'] else result({'slate': slate(own), 'existing': True})
        now = int(time.time() * 1000)
        window = now // 3_600_000
        network_key = digest(settings.secret, f'network:{client_ip}:{window}')
        db.execute('DELETE FROM submission_limits WHERE expires_at < ?', (now,))
        db.execute('INSERT INTO submission_limits(key, attempts, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET attempts = attempts + 1', (network_key, (window + 1) * 3_600_000))
        attempts = db.execute('SELECT attempts FROM submission_limits WHERE key = ?', (network_key,)).fetchone()['attempts']
        if attempts > 5:
            db.commit()
            return result({'error': 'This connection has left several slates recently. Please try again in an hour.'}, 429, {'Retry-After': str(((window + 1) * 3_600_000 - now + 999) // 1000)})
        ident = str(uuid4())
        db.execute('INSERT INTO visitors(id, name, created_at, visitor_key) VALUES (?, ?, ?, ?)', (ident, name, now, key))
        saved = db.execute('SELECT * FROM visitors WHERE id = ?', (ident,)).fetchone()
        db.commit()
        return result({'slate': slate(saved), 'existing': False}, 201)


def create_app(settings=None):
    settings = settings or Settings.from_env()

    @asynccontextmanager
    async def lifespan(app):
        await run_in_threadpool(migrate, settings.database)
        yield

    app = FastAPI(title='ASCII City Visitor API', lifespan=lifespan, docs_url=None if settings.production else '/docs')

    @app.get('/health')
    def health():
        try:
            with connect(settings.database) as db:
                db.execute('SELECT sequence FROM visitors LIMIT 1').fetchone()
            return result({'status': 'ok'})
        except sqlite3.Error:
            return result({'status': 'unavailable'}, 503)

    @app.api_route('/api/visitors', methods=['GET', 'POST', 'PATCH'])
    async def visitors(request: Request):
        headers = dict(request.headers)
        proxy_token = headers.get('x-city-proxy-token', '')
        # Only the authenticated frontend proxy may supply the client address.
        if not compare_digest(digest(settings.secret, proxy_token), digest(settings.secret, settings.proxy_secret)):
            return result({'error': 'Use the city website to access the visitor yard.'}, 403)
        client_ip = headers.get('x-city-client-ip') or 'unknown'
        body = {}
        if request.method != 'GET':
            if not headers.get('content-type', '').startswith('application/json'):
                return result({'error': 'Please send a small JSON request.'}, 400)
            raw = bytearray()
            async for chunk in request.stream():
                raw.extend(chunk)
                if len(raw) > 1024:
                    return result({'error': 'The request is too large.'}, 413)
            try:
                body = json.loads(raw)
                if not isinstance(body, dict):
                    raise ValueError()
            except (ValueError, UnicodeDecodeError):
                return result({'error': 'Please send a small JSON request.'}, 400)
        try:
            return await run_in_threadpool(handle, settings, request.method, dict(request.query_params), headers, request.cookies, body, client_ip)
        except sqlite3.Error:
            logging.exception('Visitor database request failed')
            return result({'error': 'The visitor yard is temporarily unavailable. Your input has been kept; please try again.'}, 503)

    return app


app = create_app()

