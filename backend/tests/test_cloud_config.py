from dataclasses import replace
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from app.database import VisitorStore, StorageError
from app.settings import Settings


def settings():
    return Settings('a' * 32, 'b' * 32, 'c' * 32, 'http://localhost:3000',
                    chroma_api_key='test-key', chroma_tenant='test-tenant',
                    chroma_database='test-database')


def test_cloud_client_receives_only_backend_configuration(monkeypatch, cloud):
    import chromadb
    factory = Mock(return_value=SimpleNamespace(get_or_create_collection=Mock(return_value=cloud)))
    monkeypatch.setattr(chromadb, 'CloudClient', factory)
    config = settings()
    store = VisitorStore.from_settings(config)
    factory.assert_called_once_with(api_key='test-key', tenant='test-tenant', database='test-database')
    factory.return_value.get_or_create_collection.assert_called_once_with(
        name='city_visitors_v1', embedding_function=None)
    store.health()
    assert 'test-key' not in repr(config) and 'test-tenant' not in repr(config)


@pytest.mark.parametrize('missing', ['chroma_api_key', 'chroma_tenant', 'chroma_database'])
def test_missing_cloud_configuration_fails_without_sqlite_fallback(missing):
    with pytest.raises(ValueError, match='CHROMA_API_KEY'):
        VisitorStore.from_settings(replace(settings(), **{missing: ''}))


def test_cloud_startup_error_does_not_expose_credentials(monkeypatch):
    import chromadb
    monkeypatch.setattr(chromadb, 'CloudClient', Mock(side_effect=RuntimeError('private credential')))
    with pytest.raises(StorageError) as caught:
        VisitorStore.from_settings(settings())
    assert 'private credential' not in str(caught.value)


def test_settings_read_env_and_reject_multiple_workers(monkeypatch):
    monkeypatch.setenv('ENVIRONMENT', 'development')
    monkeypatch.setenv('CHROMA_API_KEY', 'test-key')
    monkeypatch.setenv('CHROMA_TENANT', 'test-tenant')
    monkeypatch.setenv('CHROMA_DATABASE', 'test-database')
    monkeypatch.setenv('WEB_CONCURRENCY', '1')
    config = Settings.from_env()
    assert config.chroma_api_key == 'test-key'
    assert config.chroma_tenant == 'test-tenant'
    assert config.chroma_database == 'test-database'
    monkeypatch.setenv('WEB_CONCURRENCY', '2')
    with pytest.raises(ValueError, match='one worker'):
        Settings.from_env()
