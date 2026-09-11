import { resolve } from 'node:path';

// Tool state stays in this checkout on Windows, macOS and Linux.
process.env.WRANGLER_WRITE_LOGS ??= 'false';
process.env.WRANGLER_LOG_PATH ??= resolve('.wrangler/logs');
process.env.MINIFLARE_REGISTRY_PATH ??= resolve('.wrangler/registry');
process.env.WRANGLER_SEND_METRICS ??= 'false';
