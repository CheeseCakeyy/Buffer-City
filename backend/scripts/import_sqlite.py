"""Import legacy SQLite/D1 slates into Chroma. Stop all API writers first."""
import argparse
from pathlib import Path
import sqlite3
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.database import VisitorStore
from app.settings import Settings


def import_records(source, store):
    # Read-only URI prevents accidental creation or mutation of the backup.
    with sqlite3.connect(Path(source).resolve().as_uri() + '?mode=ro', uri=True) as db:
        db.row_factory = sqlite3.Row
        records = [dict(r) for r in db.execute('SELECT * FROM visitors ORDER BY sequence')]
    with store.lock:
        existing = store.rows()
        by_id = {r['id']: r for r in existing}
        by_key = {r['visitor_key']: r for r in existing}
        by_slot = {r['sequence']: r for r in existing}
        pending = []
        for row in records:
            old = by_id.get(row['id'])
            if old:
                if any(old.get(k) != row[k] for k in ('visitor_key', 'sequence', 'name', 'created_at')):
                    raise ValueError('Existing cloud record conflicts with the source; no records imported.')
                continue
            if row['visitor_key'] in by_key or row['sequence'] in by_slot:
                raise ValueError('Cloud visitor or slot conflicts with the source; no records imported.')
            pending.append(row)
        for row in pending:
            store.add(row)
        return len(pending)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    args = parser.parse_args()
    count = import_records(args.source, VisitorStore.from_settings(Settings.from_env()))
    print(f'Imported {count} slates. Source database was not modified.')
