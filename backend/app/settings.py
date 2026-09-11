from dataclasses import dataclass, field
from pathlib import Path
import os
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / '.env')


@dataclass(frozen=True)
class Settings:
    secret: str = field(repr=False)
    admin_token: str = field(repr=False)
    proxy_secret: str = field(repr=False)
    public_origin: str
    production: bool = False
    chroma_api_key: str = field(default='', repr=False)
    chroma_tenant: str = field(default='', repr=False)
    chroma_database: str = ''
    chroma_collection: str = 'city_visitors_v1'

    @classmethod
    def from_env(cls):
        production = os.getenv('ENVIRONMENT', 'development') == 'production'
        secret = os.getenv('VISITOR_SECRET') or ('' if production else 'local-preview-only-visitor-secret-00000000')
        proxy_secret = os.getenv('BACKEND_PROXY_SECRET') or ('' if production else 'local-only-proxy-secret-00000000000000')
        admin = os.getenv('VISITOR_ADMIN_TOKEN', '')
        origin = os.getenv('PUBLIC_ORIGIN', 'http://localhost:3000').rstrip('/')
        if len(secret) < 32 or len(proxy_secret) < 32:
            raise ValueError('VISITOR_SECRET and BACKEND_PROXY_SECRET must each have at least 32 characters.')
        if production and not origin.startswith('https://'):
            raise ValueError('PUBLIC_ORIGIN must use HTTPS in production.')
        if admin and len(admin) < 32:
            raise ValueError('VISITOR_ADMIN_TOKEN must have at least 32 characters when enabled.')
        if os.getenv('WEB_CONCURRENCY', '1') != '1':
            raise ValueError('Run the Chroma visitor backend with one worker (WEB_CONCURRENCY=1).')
        return cls(secret, admin, proxy_secret, origin, production,
                   os.getenv('CHROMA_API_KEY', ''), os.getenv('CHROMA_TENANT', ''),
                   os.getenv('CHROMA_DATABASE', ''), os.getenv('CHROMA_COLLECTION', 'city_visitors_v1'))

