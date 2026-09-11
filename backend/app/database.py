from contextlib import contextmanager
from pathlib import Path
import sqlite3
from .settings import ROOT


@contextmanager
def connect(path: Path):
    db = sqlite3.connect(path, timeout=10)
    db.row_factory = sqlite3.Row
    try:
        yield db
    finally:
        db.close()


def migrate(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with connect(path) as db:
        db.execute('PRAGMA journal_mode=WAL')
        db.execute('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY)')
        # Serialize startup migrations; record a migration only after all statements succeed.
        for file in sorted((ROOT / 'migrations').glob('*.sql')):
            try:
                db.execute('BEGIN IMMEDIATE')
                if not db.execute('SELECT 1 FROM schema_migrations WHERE name = ?', (file.name,)).fetchone():
                    for statement in file.read_text(encoding='utf-8').split(';'):
                        if statement.strip():
                            db.execute(statement)
                    db.execute('INSERT INTO schema_migrations(name) VALUES (?)', (file.name,))
                db.commit()
            except Exception:
                db.rollback()
                raise

