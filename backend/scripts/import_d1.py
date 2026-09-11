"""Copy an existing D1 SQLite database without overwriting the target or deleting the source."""
from pathlib import Path
import argparse
import sqlite3

parser = argparse.ArgumentParser()
parser.add_argument('source', type=Path)
parser.add_argument('--target', type=Path, default=Path(__file__).resolve().parents[1] / 'data' / 'visitors.sqlite3')
args = parser.parse_args()
if args.target.exists():
    raise SystemExit('Target already exists; refusing to overwrite visitor data.')
if not args.source.is_file():
    raise SystemExit('Source database does not exist.')
args.target.parent.mkdir(parents=True, exist_ok=True)
source = sqlite3.connect(args.source.resolve().as_uri() + '?mode=ro', uri=True)
try:
    count = source.execute('SELECT COUNT(*) FROM visitors').fetchone()[0]
    with sqlite3.connect(args.target) as target:
        source.backup(target)
    print(f'Copied {count} visitor records. Original database retained at {args.source}.')
finally:
    source.close()

