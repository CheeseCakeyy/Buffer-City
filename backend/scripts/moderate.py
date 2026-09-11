"""Hide or restore a slate through the city's authenticated API proxy."""
import argparse
import json
import os
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urlparse
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / '.env')
parser = argparse.ArgumentParser()
parser.add_argument('origin')
parser.add_argument('slate_id')
parser.add_argument('action', choices=['hide', 'restore'])
args = parser.parse_args()
token = os.getenv('VISITOR_ADMIN_TOKEN', '')
if len(token) < 32:
    raise SystemExit('Set VISITOR_ADMIN_TOKEN in backend/.env or the environment first.')
url = urlparse(args.origin)
if url.scheme != 'https' and url.hostname not in ('localhost', '127.0.0.1'):
    raise SystemExit('Hosted moderation requires HTTPS.')
request = Request(args.origin.rstrip('/') + '/api/visitors', method='PATCH',
                  headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token},
                  data=json.dumps({'id': args.slate_id, 'hidden': args.action == 'hide'}).encode())
with urlopen(request, timeout=15) as response:
    print('Slate hidden (restorable).' if args.action == 'hide' else 'Slate restored.')

