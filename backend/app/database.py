"""Chroma Cloud storage. One writer process must own this collection.

No local database, embedding model, or cached copy of visitor records is used.
The process lock protects sequence allocation; it is not a distributed lock.
"""
from threading import RLock


class StorageError(RuntimeError):
    pass


class VisitorStore:
    def __init__(self, collection):
        self.collection = collection
        self.lock = RLock()

    @classmethod
    def from_settings(cls, settings):
        if not all((settings.chroma_api_key, settings.chroma_tenant, settings.chroma_database)):
            raise ValueError('Set CHROMA_API_KEY, CHROMA_TENANT and CHROMA_DATABASE in the backend environment.')
        import chromadb
        try:
            client = chromadb.CloudClient(api_key=settings.chroma_api_key,
                                         tenant=settings.chroma_tenant,
                                         database=settings.chroma_database)
            collection = client.get_or_create_collection(
                name=settings.chroma_collection, embedding_function=None)
            return cls(collection)
        except Exception:
            raise StorageError('Unable to connect to Chroma Cloud. Check the backend environment.') from None

    def _call(self, method, **kwargs):
        try:
            return getattr(self.collection, method)(**kwargs)
        except Exception:
            # SDK exceptions may contain request details. Do not expose/log them.
            raise StorageError('Chroma Cloud request failed.') from None

    def health(self):
        self._call('count')

    def rows(self):
        # Explicit batches respect Cloud's 300-record response limit. Sorting by
        # our sequence avoids depending on Chroma's internal result ordering.
        rows = []
        offset = 0
        while True:
            batch = self._call('get', limit=300, offset=offset, include=['metadatas'])
            for ident, metadata in zip(batch['ids'], batch['metadatas']):
                rows.append({**metadata, 'id': ident})
            if len(batch['ids']) < 300:
                break
            offset += len(batch['ids'])
        return sorted(rows, key=lambda row: row['sequence'])

    def add(self, row):
        metadata = {key: value for key, value in row.items() if key != 'id'}
        # Metadata only, with a nonzero placeholder vector: no embedding model
        # is downloaded and no visitor names go to an embedding provider.
        self._call('add', ids=[row['id']], embeddings=[[1.0]], metadatas=[metadata])
        saved = self._call('get', ids=[row['id']], include=['metadatas'])
        if not saved['ids']:
            raise StorageError('Chroma did not confirm the saved slate.')
        return {**saved['metadatas'][0], 'id': saved['ids'][0]}

    def hide(self, ident, hidden):
        self._call('update', ids=[ident], metadatas=[{'hidden': int(hidden)}])
