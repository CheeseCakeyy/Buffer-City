from contextlib import asynccontextmanager
from datetime import datetime, timezone
from hashlib import sha256
from hmac import compare_digest, new as hmac_new
import json
import logging
import re
import time
import unicodedata
from uuid import UUID as SlateUUID, uuid4

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from .database import VisitorStore, StorageError
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


def handle(settings, store, method, query, headers, cookies, body, client_ip):
    token = cookies.get('city_visitor', '')
    established = bool(UUID.fullmatch(token))
    if not established:
        token = str(uuid4())
    cookie = {'Set-Cookie': f'city_visitor={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000' + ('; Secure' if settings.production else '')}
    key = digest(settings.secret, f'visitor:{token}')
    with store.lock:
        rows = store.rows()
        if method == 'GET':
            ident = query.get('slate')
            if ident:
                row = next((r for r in rows if r['id'] == ident and not r['hidden']), None) if UUID.fullmatch(ident) else None
                return result({'slate': slate(row)}, headers=cookie) if row else result({'error': 'That slate is no longer on display.'}, 404, cookie)
            raw_page = query.get('page', '0')
            if not re.fullmatch(r'[0-9]{1,7}', raw_page):
                return result({'error': 'Invalid garden page.'}, 400)
            page = int(raw_page)
            page_rows = [r for r in rows if page * PAGE_SIZE < r['sequence'] <= (page + 1) * PAGE_SIZE and not r['hidden']]
            totals = {'total': sum(not r['hidden'] for r in rows), 'last': max((r['sequence'] for r in rows), default=1)}
            own = next((r for r in rows if r['visitor_key'] == key), None)
            return result({'slates': [slate(row) for row in page_rows], 'page': page, 'pageSize': PAGE_SIZE,
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
            if not any(r['id'] == body['id'] for r in rows):
                return result({'error': 'Slate not found.'}, 404)
            store.hide(body['id'], body['hidden'])
            return result({'ok': True})
        if not established:
            return result({'error': 'Refresh the visitor yard before placing your slate.'}, 428, cookie)
        name = valid_name(body.get('name'))
        if name is None:
            return result({'error': 'Use 1–24 letters or numbers, with spaces, hyphens, underscores or apostrophes. No links.'}, 400)
        # The store lock serializes allocation within the single writer process.
        own = next((r for r in rows if r['visitor_key'] == key), None)
        if own:
            return result({'error': 'Your visit has already been recorded.'}, 409) if own['hidden'] else result({'slate': slate(own), 'existing': True})
        now = int(time.time() * 1000)
        window = now // 3_600_000
        network_key = digest(settings.secret, f'network:{client_ip}:{window}')
        # Persist the quota evidence in the slate itself, in the same write.
        # Hiding a slate does not reset the limit; Render restarts do not either.
        attempts = sum(r.get('network_key') == network_key for r in rows)
        if attempts >= 5:
            return result({'error': 'This connection has left several slates recently. Please try again in an hour.'}, 429, {'Retry-After': str(((window + 1) * 3_600_000 - now + 999) // 1000)})
        # Stable UUID makes a retry after an ambiguous Cloud response idempotent.
        ident = str(SlateUUID(hex=key[:32], version=4))
        saved = store.add({'id': ident, 'name': name, 'created_at': now, 'visitor_key': key,
                           'hidden': 0, 'network_key': network_key,
                           'sequence': max((r['sequence'] for r in rows), default=0) + 1})
        return result({'slate': slate(saved), 'existing': False}, 201)


def create_app(settings=None, store=None):
    settings = settings or Settings.from_env()

    @asynccontextmanager
    async def lifespan(app):
        app.state.store = store or await run_in_threadpool(VisitorStore.from_settings, settings)
        yield

    app = FastAPI(title='ASCII City Visitor API', lifespan=lifespan, docs_url=None if settings.production else '/docs')

    @app.get('/health')
    def health():
        try:
            app.state.store.health()
            return result({'status': 'ok'})
        except StorageError:
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
            return await run_in_threadpool(handle, settings, app.state.store, request.method, dict(request.query_params), headers, request.cookies, body, client_ip)
        except StorageError:
            logging.warning('Chroma visitor database request failed')
            return result({'error': 'The visitor yard is temporarily unavailable. Your input has been kept; please try again.'}, 503)

    return app


app = create_app()

