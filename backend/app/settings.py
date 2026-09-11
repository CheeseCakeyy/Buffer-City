from dataclasses import dataclass
from pathlib import Path
import os
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / '.env')


@dataclass(frozen=True)
class Settings:
    database: Path
    secret: str
    admin_token: str
    proxy_secret: str
    public_origin: str
    production: bool = False

    @classmethod
    def from_env(cls):
        production = os.getenv('ENVIRONMENT', 'development') == 'production'
        database = Path(os.getenv('DATABASE_PATH', 'data/visitors.sqlite3'))
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
        return cls(database if database.is_absolute() else ROOT / database, secret, admin, proxy_secret, origin, production)

