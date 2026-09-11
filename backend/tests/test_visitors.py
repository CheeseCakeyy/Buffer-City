from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from pathlib import Path
import sqlite3
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from app.settings import Settings

SECRET = 'test-visitor-secret-000000000000000000'
PROXY = 'test-proxy-secret-00000000000000000000'
ADMIN = 'test-admin-secret-00000000000000000000'
HEADERS = {'x-city-proxy-token': PROXY, 'x-city-client-ip': '203.0.113.8', 'origin': 'http://localhost:3000'}


@pytest.fixture
def settings(tmp_path):
    return Settings(tmp_path / 'visitors.sqlite3', SECRET, ADMIN, PROXY, 'http://localhost:3000')


def client_for(settings):
    return TestClient(create_app(settings), headers=HEADERS)


def test_persistence_shared_visibility_and_duplicate_retry(settings):
    with client_for(settings) as client:
        assert client.get('/health').status_code == 200
        assert client.get('/api/visitors').json()['total'] == 0
        token = client.cookies.get('city_visitor')
        saved = client.post('/api/visitors', json={'name': '  Adwait  '})
        assert saved.status_code == 201
        slate = saved.json()['slate']
        assert slate['name'] == 'Adwait'
        assert slate['slot'] == 0
        assert client.post('/api/visitors', json={'name': 'Adwait'}).json()['slate'] == slate
    with client_for(settings) as fresh:
        page = fresh.get('/api/visitors').json()
        assert page['total'] == 1
        assert page['slates'] == [slate]
        assert page['own'] is None
        assert 'visitor_key' not in page['slates'][0]
        fresh.cookies.set('city_visitor', token)
        assert fresh.get('/api/visitors').json()['own'] == slate
        assert fresh.get('/api/visitors?slate=' + slate['id']).json()['slate'] == slate


def test_concurrent_retries_get_one_slot(settings):
    with client_for(settings) as client:
        client.get('/api/visitors')
        def submit(_):
            return client.post('/api/visitors', json={'name': 'Concurrent Visitor'})
        with ThreadPoolExecutor(max_workers=8) as pool:
            responses = list(pool.map(submit, range(8)))
        assert sum(r.status_code == 201 for r in responses) == 1
        assert {r.status_code for r in responses} <= {200, 201}
        assert len({r.json()['slate']['id'] for r in responses}) == 1
        assert client.get('/api/visitors').json()['total'] == 1


def test_validation_origins_and_proxy_auth(settings):
    with client_for(settings) as client:
        assert client.get('/api/visitors', headers={'x-city-proxy-token': 'forged'}).status_code == 403
        client.get('/api/visitors')
        for name in ['', 'x' * 25, '<script>', 'https://example.com', '---', 'a\u202eb']:
            assert client.post('/api/visitors', json={'name': name}).status_code == 400
        assert client.post('/api/visitors', json={'name': 'Name'}, headers={'origin': 'https://evil.example'}).status_code == 403
        assert client.post('/api/visitors', json={'name': 'Name'}, headers={'sec-fetch-site': 'cross-site'}).status_code == 403
        assert client.post('/api/visitors', json={'name': 'x' * 2000}).status_code == 413
        assert client.post('/api/visitors', content='oops', headers={'Content-Type': 'application/json'}).status_code == 400
        assert client.post('/api/visitors', json={'name': '李 明'}).status_code == 201
        assert client.get('/api/visitors?page=-1').status_code == 400
        assert client.delete('/api/visitors').status_code == 405


def test_network_limit_and_hashes(settings):
    with client_for(settings) as client:
        for i in range(6):
            client.cookies.clear()
            client.get('/api/visitors')
            response = client.post('/api/visitors', json={'name': 'Visitor ' + str(i)})
            assert response.status_code == (201 if i < 5 else 429)
        assert int(response.headers['retry-after']) > 0
    with sqlite3.connect(settings.database) as db:
        rows = db.execute('SELECT * FROM submission_limits').fetchall()
        assert len(rows) == 1 and rows[0][1] == 6
        assert '203.0.113.8' not in str(rows)


def test_moderation_preserves_positions(settings):
    with client_for(settings) as client:
        client.get('/api/visitors')
        first = client.post('/api/visitors', json={'name': 'First'}).json()['slate']
        payload = {'id': first['id'], 'hidden': True}
        assert client.patch('/api/visitors', json=payload).status_code == 401
        assert client.patch('/api/visitors', json=payload, headers={'Authorization': 'Bearer ' + ADMIN}).status_code == 200
        assert client.get('/api/visitors').json()['total'] == 0
        assert client.get('/api/visitors?slate=' + first['id']).status_code == 404
        assert client.post('/api/visitors', json={'name': 'Again'}).status_code == 409
        client.cookies.clear()
        client.get('/api/visitors')
        second = client.post('/api/visitors', json={'name': 'Second'}).json()['slate']
        assert second['slot'] == 1
        assert client.patch('/api/visitors', json={**payload, 'hidden': False}, headers={'Authorization': 'Bearer ' + ADMIN}).status_code == 200


def test_pagination_and_legacy_database(settings):
    # Start with the old D1 schema/data to verify migration preserves link IDs and dates.
    with sqlite3.connect(settings.database) as db:
        db.executescript((Path(__file__).parents[1] / 'migrations/0001_visitors.sql').read_text())
        for i in range(50):
            ident = str(uuid4())
            db.execute('INSERT INTO visitors(id, name, created_at, visitor_key) VALUES (?, ?, ?, ?)', (ident, 'Visitor ' + str(i), 1789084800000, 'legacy-' + str(i)))
    with client_for(settings) as client:
        page = client.get('/api/visitors').json()
        assert page['total'] == 50 and len(page['slates']) == 48 and page['lastPage'] == 1
        assert len(client.get('/api/visitors?page=1').json()['slates']) == 2
        linked = client.get('/api/visitors?slate=' + ident).json()['slate']
        assert linked['page'] == 1 and linked['slot'] == 1
        assert linked['createdAt'] == '2026-09-11T00:00:00.000Z'


def test_secure_cookies_and_unavailable_storage(settings):
    with client_for(replace(settings, production=True, public_origin='https://city.example')) as client:
        response = client.get('/api/visitors')
        assert 'Secure' in response.headers['set-cookie']
        assert 'HttpOnly' in response.headers['set-cookie']
    with client_for(settings) as client:
        with sqlite3.connect(settings.database) as db:
            db.execute('DROP TABLE visitors')
        assert client.get('/api/visitors').status_code == 503

