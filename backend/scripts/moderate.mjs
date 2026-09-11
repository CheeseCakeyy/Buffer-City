// Credentials come from the environment, never a command-line argument or browser bundle.
const [origin, id, action] = process.argv.slice(2);
if (!origin || !id || !['hide', 'restore'].includes(action) || !process.env.VISITOR_ADMIN_TOKEN) {
  console.error('Usage: npm run slate:moderate -- <city-origin> <slate-id> <hide|restore>\nSet VISITOR_ADMIN_TOKEN in your environment first.');
  process.exit(1);
}
const url = new URL('/api/visitors', origin);
if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Use HTTPS for a hosted city.');
const result = await fetch(url, {
  method: 'PATCH', signal: AbortSignal.timeout(15_000),
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.VISITOR_ADMIN_TOKEN}` },
  body: JSON.stringify({ id, hidden: action === 'hide' }),
});
if (!result.ok) { console.error(`Moderation failed (${result.status}): ${await result.text()}`); process.exit(1); }
console.log(action === 'hide' ? 'Slate hidden. Its position is reserved and can be restored.' : 'Slate restored.');
