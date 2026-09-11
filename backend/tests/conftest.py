"""A remote-store double: shared data survives new API/store instances."""
from copy import deepcopy
import pytest


class CloudCollection:
    def __init__(self):
        self.records = {}
        self.fail = False
        self.fail_after_add = False

    def check(self):
        if self.fail:
            raise RuntimeError('private SDK request details')

    def count(self):
        self.check()
        return len(self.records)

    def get(self, ids=None, limit=300, offset=0, include=None):
        self.check()
        keys = [key for key in (ids if ids is not None else self.records) if key in self.records]
        keys = keys[offset:offset + limit]
        return {'ids': keys, 'metadatas': [deepcopy(self.records[key]) for key in keys]}

    def add(self, ids, embeddings, metadatas):
        self.check()
        assert embeddings == [[1.0]]
        for ident, metadata in zip(ids, metadatas):
            self.records.setdefault(ident, deepcopy(metadata))
        if self.fail_after_add:
            self.fail_after_add = False
            raise TimeoutError('response lost after cloud committed the write')

    def update(self, ids, metadatas):
        self.check()
        for ident, metadata in zip(ids, metadatas):
            self.records[ident].update(metadata)


@pytest.fixture
def cloud():
    return CloudCollection()
